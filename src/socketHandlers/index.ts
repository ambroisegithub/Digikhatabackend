
import type { Server, Socket } from "socket.io"
import { setupSalesSocketHandlers } from "./salesSocketHandlers"

export const setupSocketHandlers = (io: Server) => {
  const activeUsers = new Map<number, Set<string>>()

  io.use((socket, next) => {
    const clientAddress = socket.handshake.address
    console.log(`New connection attempt from ${clientAddress}`)
    next()
  })

  io.on("connection", (socket: Socket) => {
    console.log("User connected:", socket.id)
    socket.emit("connection_success", {
      message: "Socket connected successfully",
      socketId: socket.id,
    })

    socket.on("test_event", (data) => {
      console.log("Received test_event:", data)
      socket.emit("test_response", {
        message: "Test event received successfully",
        receivedData: data,
        timestamp: new Date().toISOString(),
      })
    })



    socket.on("disconnect_user", () => {
      handleDisconnect(socket)
      socket.disconnect()
    })

    socket.on("disconnect", () => {
      handleDisconnect(socket)
    })


  })

  setupSalesSocketHandlers(io)

  function handleDisconnect(socket: Socket) {
    console.log("User disconnected:", socket.id)

    if (socket.data.user) {
      const userId = socket.data.user.id

      // Remove the socket ID from the activeUsers map
      const userSockets = activeUsers.get(userId)
      if (userSockets) {
        userSockets.delete(socket.id)
        if (userSockets.size === 0) {
          activeUsers.delete(userId)

          // Notify organization members that user is offline
          if (socket.data.user.organization) {
            socket.to(`org_${socket.data.user.organization.id}`).emit("user_offline", { userId })
          }
          console.log(`User ${userId} marked as offline`)
        }
      }
    }
  }
}
