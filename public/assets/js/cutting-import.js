// Normalize flat, classic Aspire polylines for the existing server geometry validator.
// Keep arc bulges and drawing units so previews, dimensions and quotes agree.
export function normalizeDxf(source, selectedUnit = '') {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g,'\n');
  if (!/^\s*0\s*\nSECTION\s*$/im.test(text) || /\x00/.test(text)) throw new Error('Choose an ASCII DXF or export your drawing as a vector PDF.');
  const header = /(^[ \t]*0[ \t]*\nSECTION[ \t]*\n[ \t]*2[ \t]*\nHEADER[ \t]*\n)([\s\S]*?)(?=^[ \t]*0[ \t]*\nENDSEC)/im;
  const fields = header.exec(text);
  if (!fields) throw new Error('This DXF is missing its drawing header.');
  const units = /(^[ \t]*9[ \t]*\n\$INSUNITS[ \t]*\n[ \t]*70[ \t]*\n)[ \t]*(\d+)[ \t]*$/im;
  const declared = units.exec(fields[2]);
  const needsUnits = !declared || Number(declared[2]) === 0;
  if (needsUnits && !['4','1','5','6'].includes(selectedUnit)) return {needsUnits:true};
  let result = needsUnits ? text.replace(header, (_,prefix,body) => prefix + (declared ?
    body.replace(units, (_, field) => field+selectedUnit) : body+'9\n$INSUNITS\n70\n'+selectedUnit+'\n')) : text;
  if (!/^[ \t]*0[ \t]*\nPOLYLINE[ \t]*$/im.test(result)) return {dxf:result};
  const section = /(^[ \t]*0[ \t]*\nSECTION[ \t]*\n[ \t]*2[ \t]*\nENTITIES[ \t]*\n)([\s\S]*?)(?=^[ \t]*0[ \t]*\nENDSEC)/im;
  result = result.replace(section, (_,prefix,entities) => {
    const lines=entities.trimEnd().split('\n'), records=[];
    for(let i=0;i<lines.length;i+=2) {
      const code=lines[i].trim(), value=lines[i+1]?.trim();
      if(value===undefined || !/^\d+$/.test(code)) throw new Error('The DXF contains an incomplete entity.');
      if(code==='0') records.push({type:value.toUpperCase(), data:[]});
      if(!records.length) throw new Error('Invalid DXF entity.');
      if(code!=='0') records.at(-1).data.push([Number(code),value]);
    }
    const out=[];
    const field=(record,code,otherwise)=>record.data.find(([key])=>key===code)?.[1] ?? otherwise;
    const flat=(record,allowedFlags)=> {
      const flags=Number(field(record,70,'0'));
      if(!Number.isSafeInteger(flags) || (flags & ~allowedFlags) || [30,39,40,41,60,67,210,220].some(code=>Number(field(record,code,'0'))!==0)
          || Number(field(record,230,'1'))!==1 || field(record,410,'Model')!=='Model')
        throw new Error('Export visible, flat 2D outlines without fitted, wide or 3D polylines.');
    };
    for(let i=0;i<records.length;i++){
      const r=records[i];
      if(r.type!=='POLYLINE') {out.push('0',r.type);for(const [c,v] of r.data) out.push(c,v);continue;}
      flat(r,129);
      const vertices=[];
      while(records[i+1]?.type==='VERTEX') {
        const v=records[++i]; flat(v,0);
        const x=field(v,10), y=field(v,20), b=field(v,42,'0');
        if([x,y,b].some(n=>n===undefined || n==='' || !Number.isFinite(Number(n)))) throw new Error('A polyline vertex is incomplete.');
        vertices.push([10,x,20,y,42,b]);
      }
      if(vertices.length<2 || records[++i]?.type!=='SEQEND') throw new Error('A classic polyline is incomplete.');
      out.push(0,'LWPOLYLINE',100,'AcDbEntity',8,field(r,8,'0'),100,'AcDbPolyline',90,vertices.length,70,field(r,70,'0'));
      for(const vertex of vertices) out.push(...vertex);
    }
    return prefix+out.join('\n')+'\n';
  });
  // This internal geometry copy now uses the lightweight entity dialect.
  result=result.replace(/(^[ \t]*9[ \t]*\n\$ACADVER[ \t]*\n[ \t]*1[ \t]*\n)AC1009/im,(_,field)=>field+'AC1015');
  return {dxf:result};
}
