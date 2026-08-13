import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { listMachines } from '../db/repo/machines.js'
import { listTechnicians } from '../db/repo/users.js'

export const machinesRouter = Router()

machinesRouter.get('/api/machines', requireAuth, (req, res) => {
  res.json(listMachines())
})

machinesRouter.get('/api/technicians', requireAuth, (req, res) => {
  res.json(listTechnicians())
})
