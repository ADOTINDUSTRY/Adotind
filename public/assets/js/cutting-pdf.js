// Read one-page vector artwork locally. The server independently measures the
// resulting paths before using them for a quotation.
import {getDocument, GlobalWorkerOptions, OPS} from './quote-vendor/pdf.min.js';
GlobalWorkerOptions.workerSrc = new URL('./quote-vendor/pdf.worker.min.js', import.meta.url).href;

const fail = () => { throw new Error('This PDF needs drawing review. Export one page of visible cutting paths, with text converted to curves and images removed.'); };
const midpoint = (p,q) => ({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
const near = (p,q) => Math.hypot(p.x-q.x,p.y-q.y)<0.000001;
function distanceToSegment(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export async function pdfCuttingDxf(bytes) {
  const task=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,stopAtErrors:true});
  try {
    const doc=await task.promise;
    if(doc.numPages!==1) throw new Error('Export a single PDF page for the part you want to cut.');
    const page=await doc.getPage(1);
    if((await page.getAnnotations()).length) fail();
    const list=await page.getOperatorList();
    const view=page.getViewport({scale:25.4/72,dontFlip:true});
    // Aspire 10's ODA exporter rounds the page box to whole PDF points
    // but retains finer coordinates for the vectors and its explicit job clip.
    const {info}=await doc.getMetadata();
    const roundedPage=/^ODA PDF Export\b/i.test(info?.Producer || '') && page.view.every(Number.isInteger);
    const margin=roundedPage ? .5*25.4/72*(page.userUnit||1) : 0;
    let state={matrix:new DOMMatrix(view.transform), layer:'PDF_OUTLINE',clip:[-margin,-margin,view.width+margin,view.height+margin]};
    const stack=[], contours=[], names=new Map(Object.entries(OPS).map(([k,v])=>[v,k]));
    let pending=[], path=null, pen=null, count=0, clipNext=false;
    const point=(x,y)=>state.matrix.transformPoint({x,y});
    function append(p){
      if(!path || !Number.isFinite(p.x) || !Number.isFinite(p.y) || ++count>500000) fail();
      if(path.closed){path={points:[pen],closed:false};pending.push(path);}
      pen=p;if(!path.points.length||!near(p,path.points.at(-1)))path.points.push(p);
    }
    function move(p){path={points:[],closed:false};pending.push(path);append(p);}
    function close(){if(!path?.points.length)fail();path.closed=true;pen=path.points[0];}
    function curve(a,b,c,d,depth=0){
      if(Math.max(distanceToSegment(b,a,d),distanceToSegment(c,a,d))<=0.01){append(d);return;}
      if(depth===20)fail();
      const ab=midpoint(a,b),bc=midpoint(b,c),cd=midpoint(c,d),abc=midpoint(ab,bc),bcd=midpoint(bc,cd),m=midpoint(abc,bcd);
      curve(a,ab,abc,m,depth+1);curve(m,bcd,cd,d,depth+1);
    }
    function build([ops,coords]){
      let i=0;const next=()=>point(coords[i++],coords[i++]);
      for(const op of ops){
        switch(op){
          case OPS.moveTo:move(next());break;
          case OPS.lineTo:append(next());break;
          case OPS.closePath:close();break;
          case OPS.rectangle:{
            const x=coords[i++],y=coords[i++],w=coords[i++],h=coords[i++];
            move(point(x,y));append(point(x+w,y));append(point(x+w,y+h));append(point(x,y+h));close();break;
          }
          case OPS.curveTo:curve(pen,next(),next(),next());break;
          case OPS.curveTo2:curve(pen,pen,next(),next());break;
          case OPS.curveTo3:{const b=next(),d=next();curve(pen,b,d,d);break;}
          default:fail();
        }
      }
    }
    function restrictClip(pts){
      if(pts.length!==4 || pts.some((p,i)=>{const q=pts[(i+1)%4];return Math.abs(q.x-p.x)>1e-6 && Math.abs(q.y-p.y)>1e-6;}))fail();
      const [l,b,r,t]=state.clip;
      state.clip=[Math.max(l,Math.min(...pts.map(p=>p.x))),Math.max(b,Math.min(...pts.map(p=>p.y))),Math.min(r,Math.max(...pts.map(p=>p.x))),Math.min(t,Math.max(...pts.map(p=>p.y)))];
    }
    function finish(paint,fill){
      if(paint)for(const p of pending){
        if(p.points.length<2) continue;
        const [l,b,r,t]=state.clip;
        if(p.points.some(q=>q.x<l-.002||q.y<b-.002||q.x>r+.002||q.y>t+.002))fail();
        if(fill || near(p.points[0],p.points.at(-1)))p.closed=true;
        if(p.closed && near(p.points[0],p.points.at(-1)))p.points.pop();
        if(p.points.length<2)fail();
        contours.push({...p,layer:state.layer});
      }
      if(clipNext){if(pending.length!==1)fail();restrictClip(pending[0].points);}
      clipNext=false;pending=[];path=null;pen=null;
    }
    for(let i=0;i<list.fnArray.length;i++){
      const op=names.get(list.fnArray[i]),args=list.argsArray[i]??[];
      switch(op){
        case 'save':stack.push({...state});break;
        case 'restore':if(!stack.length)fail();state=stack.pop();break;
        case 'transform':state.matrix=state.matrix.multiply(new DOMMatrix(args));break;
        case 'constructPath':build(args);break;
        case 'clip':case 'eoClip':clipNext=true;break;
        case 'endPath':finish(false,false);break;
        case 'closeStroke':close();finish(true,false);break;
        case 'stroke':finish(true,false);break;
        case 'fill':case 'eoFill':case 'fillStroke':case 'eoFillStroke':case 'closeFillStroke':case 'closeEOFillStroke':finish(true,true);break;
        case 'setStrokeRGBColor':{
          const rgb=Array.from(args).join(',');
          state.layer=rgb==='0,71,178'?'FACE_CUT':rgb==='199,48,0'?'GROOVE_REFERENCE':'PDF_'+Array.from(args).join('_');break;
        }
        case 'setDash':if(args[0]?.length)fail();break;
        case 'setGState':
          if(args[0].some(([key,value])=>!(['LW','LC','LJ','ML','RI','FL'].includes(key) || (['ca','CA'].includes(key)&&value===1) || (key==='BM' && ['Normal','source-over'].includes(value)))))fail();
          break;
        case 'setLineWidth':case 'setLineCap':case 'setLineJoin':case 'setMiterLimit':case 'setFlatness':
        case 'setRenderingIntent':case 'setFillRGBColor':case 'setFillGray':case 'setStrokeGray':case 'setFillCMYKColor':case 'setStrokeCMYKColor':break;
        case 'beginMarkedContent':case 'endMarkedContent':break;
        case 'beginMarkedContentProps':if(args[0]==='OC')fail();break;
        default:fail();
      }
    }
    if(!contours.length || pending.length || clipNext || stack.length)fail();
    const out=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,0,'ENDSEC',0,'SECTION',2,'ENTITIES'];
    for(const p of contours){
      out.push(0,'LWPOLYLINE',100,'AcDbEntity',8,p.layer,100,'AcDbPolyline',90,p.points.length,70,p.closed?1:0);
      for(const {x,y} of p.points)out.push(10,Number(x.toFixed(5)),20,Number(y.toFixed(5)));
    }
    out.push(0,'ENDSEC',0,'EOF');return out.join('\n')+'\n';
  } finally {await task.destroy();}
}
