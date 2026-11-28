// Serve only the packaged production files, allowing a phone on the same LAN to join.
import http from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
const adjacentDist = new URL('./dist/',import.meta.url)
const root = existsSync(new URL('index.html',adjacentDist)) ? adjacentDist : new URL('../dist/',import.meta.url)
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
const loopback=process.argv.includes('--loopback')
server.listen(port,loopback?'127.0.0.1':'0.0.0.0',()=>{
  console.log('PC: http://127.0.0.1:'+port)
  if (loopback) return
  let interfaces={}
  try { interfaces=networkInterfaces() } catch { console.log('LAN address unavailable. Use the PC network settings to find its IPv4 address.') }
  for(const group of Object.values(interfaces))for(const ip of group??[]){
    if(ip.family==='IPv4'&&!ip.internal)console.log('LAN: http://'+ip.address+':'+port)
  }
})

