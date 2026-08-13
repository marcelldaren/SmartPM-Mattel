import 'dotenv/config'
import { app } from './app.js'

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
