# API Integration Guide - Jogos de Cassino

Este documento descreve o processo de autenticação e inicialização de jogos através da API disponível.

## 📋 Pré-requisitos

- Acesso à API base: `https://api.appbackend.tech`
- Credenciais válidas de acesso
- Conhecimento do ID do jogo desejado

## 🔐 Autenticação

### Endpoint de Login

```bash
curl --location 'https://api.appbackend.tech/login' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "seu-email@gmail.com",
  "password": "sua-senha",
  "brand": "betou, betfusion ou sortenabet"
}'
```

### Resposta de Sucesso

```json
{
  "success": true,
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 🎮 Inicialização de Jogo

### Endpoint Start Game

```bash
curl --location 'http://localhost:8001/start-game/29' \
--header 'Authorization: Bearer seu-token-jwt-aqui'
```

### Resposta Esperada

A API retornará diretamente a `gameUrl` do jogo solicitado.

## 🎰 Lista de Jogos Disponíveis

| ID  | Nome do Jogo                   |
| --- | ------------------------------ |
| 55  | Immersive Roulette             | 
| 32  | Vip Roulette                   |
| 33  | Lightning Roulette             |
| 34  | Roleta ao Vivo                 |
| 29  | Aviator                        |
| 31  | Auto Roulette Vip              |
| 54  | Bac Bo                         |
| 10  | Dragon Hatch                   |
| 18  | Lucky Neko                     |
| 21  | Tigre Sortudo                  |
| 16  | Shaolin Soccer                 |
| 23  | Gates of Olympus Super Scatter |
| 27  | teste                          |
| 35  | Red Door Roulette              |
| 36  | Speed Roulette                 |
| 53  | Football Studio                |
| 13  | Midas Fortune                  |
| 15  | Cash Mania                     |
| 6   | Fortune Snake                  |
| 11  | Wild Bandito                   |
| 12  | Sweet Bonanza                  |
| 8   | Fortune Mouse                  |
| 9   | Pinata Wins                    |
| 20  | Double Fortune                 |
| 30  | Graffiti Rush                  |
| 22  | Genie's 3 Wishes               |
| 7   | Fortune Dragon                 |
| 5   | Fortune Ox                     |
| 4   | Fortune Tiger                  |
| 14  | Gates of Olympus 1000          |
| 3   | Fortune Rabbit                 |
| 17  | Gates of Olympus               |
| 24  | Big Bass Splash                |
| 1   | Fortune Pirates                |
| 19  | Dragon Hatch 2                 |
| 2   | Fortune Fruits                 |

## ⚠️ Notas Importantes

- Substitua as credenciais de exemplo pelas suas credenciais reais
- O token JWT tem validade limitada - renove quando expirar
- Use o ID correto do jogo desejado na rota `/start-game/{id}`
