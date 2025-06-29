
import dotenv from "dotenv"
dotenv.config()

import "reflect-metadata"

import app from "./app"

import DbConnection from "./database"
import { createServer } from "http"

const PORT = process.env.PORT || 3002
const httpServer = createServer(app)
;(async () => {
  try {
    if (!DbConnection.isInitialized) {
      await DbConnection.initialize()
      console.log("Database connection established successfully.")
    }


    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`)
  
    })
  } catch (error) {
    console.error("Error initializing database connection:", error)
    process.exit(1)
  }
})()
