# P2P File Transfer Server

Node.js + Express + MongoDB + Socket.IO backend for P2P file transfer application.

## Features

- **Authentication**: Register/Login with JWT tokens (HTTP-only cookies)
- **WebRTC Signaling**: Socket.IO server for peer connection signaling
- **MongoDB**: User data storage with Mongoose
- **Security**: Bcrypt password hashing, HTTP-only cookies

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment

Create a `.env` file (or copy from `.env.example`):

```env
PORT=4000
MONGO_URL=mongodb://localhost:27017/p2p-app
JWT_SECRET=your-super-secret-jwt-key-change-in-production
NODE_ENV=development
```

**MongoDB Options:**

- **Local**: Install MongoDB locally and use `mongodb://localhost:27017/p2p-app`
- **MongoDB Atlas**: Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas) and use the connection string

### 3. Start MongoDB (if using local)

```bash
# macOS with Homebrew
brew services start mongodb-community

# Or run manually
mongod --dbpath=/path/to/data
```

### 4. Run the Server

Development mode with auto-reload:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

Server will start on `http://localhost:4000`

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user

  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }
  ```

- `POST /api/auth/login` - Login user

  ```json
  {
    "email": "john@example.com",
    "password": "password123"
  }
  ```

- `GET /api/auth/me` - Get current user (requires auth cookie)

- `POST /api/auth/logout` - Logout user

### Health Check

- `GET /api/health` - Server and MongoDB status

## WebRTC Signaling

Socket.IO events:

- `create-room` - Create a new room
- `join-room` - Join an existing room
- `offer` - Send WebRTC offer (supports direct `to: socketId` or room broadcast)
- `answer` - Send WebRTC answer
- `ice-candidate` - Exchange ICE candidates

## Project Structure

```
server/
├── index.js              # Main server file
├── models/
│   └── User.js          # Mongoose User model
├── routes/
│   └── auth.js          # Authentication routes
├── utils/
│   └── jwt.js           # JWT helpers
├── package.json
├── .env                 # Environment variables (create this)
└── .env.example         # Example environment file
```

## Testing

1. Start the server
2. Use the frontend client to register/login
3. Open Dashboard in two browser windows
4. Copy socket ID from one window and paste into the other
5. Click "Connect" to establish P2P connection
6. Select files to transfer

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Use a strong `JWT_SECRET`
3. Enable HTTPS (required for WebRTC)
4. Use MongoDB Atlas or managed MongoDB
5. Consider adding rate limiting
6. Add TURN server for NAT traversal

## Troubleshooting

**MongoDB Connection Error:**

- Ensure MongoDB is running
- Check MONGO_URL in `.env`
- For Atlas, whitelist your IP address

**Port Already in Use:**

```bash
lsof -ti:4000 | xargs kill
```

**CORS Issues:**

- Check client URL in `cors` options in `index.js`
- Ensure `credentials: true` in client fetch/axios calls
