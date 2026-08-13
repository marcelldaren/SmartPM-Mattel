import 'dotenv/config'
import dns from 'node:dns'
import { app } from './app.js'

/**
 * Prefer IPv4 when resolving outbound hostnames.
 *
 * Node follows the resolver's own ordering by default, and public mail hosts advertise AAAA
 * records — so smtp.gmail.com resolves to IPv6 first. Container runtimes commonly provide no
 * IPv6 route, and the connection then fails with ENETUNREACH rather than falling back to the
 * A record, so every outgoing email fails on a host where IPv4 would have worked.
 *
 * Set before anything opens a socket. Harmless where IPv6 does work: the A record is still a
 * valid route to the same server.
 */
dns.setDefaultResultOrder('ipv4first')

// Last-resort net: a request-handling bug should return a 500 for that request,
// never take the whole process down (Node's default for an unhandled rejection).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

const port = Number(process.env.PORT ?? 4000)
app.listen(port, () => console.log(`SmartPM server listening on http://localhost:${port}`))
