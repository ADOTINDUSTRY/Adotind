<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="<?= e($csrf) ?>">
  <title>A Dot SVG Trace | A Dot Industry</title>
  <link rel="stylesheet" href="/online-quote/svg-trace/assets/app.css">
  <script defer src="/online-quote/svg-trace/assets/trace.js"></script>
  <script defer src="/online-quote/svg-trace/assets/editor.js"></script>
</head>
<body>
  <nav class="wrap" aria-label="Project navigation"><a class="btn btn-sm" href="/online-quote">← Project list</a></nav>
  <main><?php require $root . '/app/views/pages/trace.php'; ?></main>
</body>
</html>
