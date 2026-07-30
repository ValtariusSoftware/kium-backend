import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { EntityType } from 'src/common/constants/entities.constant'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from 'src/users/users.service' // O tu servicio para buscar al usuario

@WebSocketGateway({ cors: { origin: '*' } })
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService, // Opcional: si querés validar que el usuario exista en DB
  ) {}

  async handleConnection(client: Socket) {
    try {
      // 1. Extraemos el token que mandó Android (o tu cliente React)
      const token =
        client.handshake.auth?.token || client.handshake.headers?.authorization

      if (!token) {
        client.disconnect()
        return
      }

      // 2. Decodificamos el token igual que lo hace tu JwtStrategy
      const payload = this.jwtService.verify(token)
      const userId = payload.sub || payload.id // Asegurate si usas .sub o .id en tu payload

      if (!userId) {
        client.disconnect()
        return
      }

      // Opcional y recomendado: Validar que el usuario siga existiendo en la DB
      const user = await this.usersService.findOneById(userId)
      if (!user) {
        client.disconnect()
        return
      }

      // 3. ¡Listo! Asociamos el ID a la sesión del socket y lo metemos en su Room
      client.data.userId = userId
      await client.join(userId)

      console.log(`[WebSocket] Conectado con éxito. Usuario ID: ${userId}`)
    } catch (e) {
      console.error(e)
      console.log(`[WebSocket] Rechazado: Token inválido o expirado`)
      client.disconnect()
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[WebSocket] Cliente desconectado: ${client.id}`)
  }

  notifyEntityUpdated(
    entityType: EntityType,
    userId: string,
    originClientId?: string | null,
  ) {
    this.server.to(userId).emit('entity_updated', {
      entityType,
      userId,
      originClientId: originClientId || null,
    })
  }
}
