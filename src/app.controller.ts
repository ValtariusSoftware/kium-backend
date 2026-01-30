import { Controller, Get } from '@nestjs/common'
import { Public } from './common/decorators/public.decorator'

@Controller()
export class AppController {
  @Public()
  @Get()
  getHello(): string {
    return `<!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kium Backend</title>
        <style>
          body { 
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            display: flex; justify-content: center; align-items: center; 
            height: 100vh; margin: 0; background-color: #f0f2f5;
          }
          .card {
            background: white; padding: 2.5rem; border-radius: 16px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center;
            max-width: 420px; border-top: 6px solid #615DF9;
          }
          h1 { color: #1a1a1a; margin-bottom: 0.5rem; font-size: 24px; }
          p { color: #5f6368; line-height: 1.6; margin-bottom: 1.5rem; }
          
          .btn-graphql {
            display: inline-block;
            background-color: #615DF9;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(98, 0, 238, 0.2);
          }
          
          .btn-graphql:hover {
            background-color: #615DF9;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(98, 0, 238, 0.3);
          }

          .btn-graphql:active {
            transform: translateY(0);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="font-size: 50px; margin-bottom: 10px;"></div>
          <h1>Kium Backend</h1>
          <p>El servidor está encendido y listo para recibir peticiones.</p>
          <p>Accedé al Playground de GraphQL para explorar la API:</p>
          <a href="/graphql" class="btn-graphql">Explorar GraphQL</a>
        </div>
      </body>
    </html>
  `
  }
}
