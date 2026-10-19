import http from "http"; import fs from "fs"; import path from "path";
const root=process.cwd();
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".json":"application/json"};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/index.html";
  const fp=path.join(root,p);
  fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end("404");return;} res.writeHead(200,{"Content-Type":MIME[path.extname(fp).toLowerCase()]||"application/octet-stream"}); res.end(d); });
}).listen(8123,()=>console.log("serving on 8123"));
