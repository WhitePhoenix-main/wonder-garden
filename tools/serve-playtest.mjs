// Serve only the packaged production files, allowing a phone on the same LAN to join.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
const root=new URL('./dist/',import.meta.url)
const port=Number(process.argv[2] ?? 4173)
const mime={html:'text/html; charset=utf-8',svg:'image/svg+xml',js:'text/javascript',css:'text/css'}
const server=http.createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost').pathname
    const file=path==='/' ? 'index.html' : path.slice(1)
    if (!/^(index\.html|garden\.svg|assets\/[\w.-]+\.(js|css))$/.test(file)) {
      res.writeHead(404).end();return
    }
    const body=await readFile(new URL(file,root))
    res.writeHead(200,{'Content-Type':mime[file.split('.').pop()]}).end(body)
  } catch {res.writeHead(404).end()}
})
server.on('error',e=>{console.error(e.message);process.exitCode=1})
server.listen(port,'0.0.0.0',()=>{
  console.log('PC: http://127.0.0.1:'+port)
  for(const group of Object.values(networkInterfaces()))for(const ip of group??[]){
    if(ip.family==='IPv4'&&!ip.internal)console.log('LAN: http://'+ip.address+':'+port)
  }
})

