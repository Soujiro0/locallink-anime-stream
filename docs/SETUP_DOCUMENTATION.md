Version: 1.1.0

# Setup Documentation

This guide will walk you through setting up and running LocalLink locally for development or production use.

## Prerequisites

- **Node.js** (v20+ recommended)
- **Git**

## Local Development Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Soujiro0/locallink-anime-stream.git
   cd locallink-anime-stream
   ```

2. **Install Backend Dependencies:**

   ```bash
   npm install
   ```

3. **Install Frontend Dependencies:**

   ```bash
   cd client
   npm install
   ```

4. **Start the Development Servers:**
   - For the **backend** (API), run `npm run start` in the root folder. It will start on `http://localhost:3000`.
   - For the **frontend** (React UI), run `npm run dev` in the `client` folder. It will start on `http://localhost:5173`.

## Production Build

To build the React application for production so that it is served natively by the Express server:

```bash
npm run build:client
```

Then, you can start the optimized production server:

```bash
npm run start
```

The entire application will be accessible at `http://localhost:3000`.

## Building Standalone Executables (Linux / Windows)

LocalLink uses `pkg` to bundle the Node.js server and React frontend into single, portable executable files that do not require Node.js to be installed on the target machine.

1. Ensure you have built the React frontend:

   ```bash
   npm run build:client
   ```

2. Run the packaging script:

   ```bash
   npm run package
   ```

3. The executables will be generated in the `dist-bin/` directory:
   - `locallink-linux`
   - `locallink-win.exe`

## Changing the Port

### Standalone Executables

When running the compiled executables (`locallink-win.exe` or `locallink-linux`), the application will interactively prompt you to enter a port in the terminal:

```
==========================================
 Welcome to LocalLink Server!
==========================================
Please specify the port to run the server on.
Valid ports are generally between 1024 and 65535.
------------------------------------------

Enter port [Default: 3000]:
```

### Development and Docker

For development and Docker environments, you should configure the port using the `.env` file. Copy the `.env.example` file to `.env` and set your desired ports:

```env
PORT=3000
PROXY_PORT=3010
```

## Docker Setup

LocalLink provides a Dockerized environment for easy deployment. The provided `docker-compose.yml` sets up the Node.js application alongside an Nginx reverse proxy.

1. Ensure Docker and Docker Compose are installed on your machine.
2. From the root directory of the project, run:
   ```bash
   docker compose build
   ```
   then:
   ```bash
   docker compose up -d
   ```
3. The application will be built and accessible via the Nginx proxy at `http://localhost:3010`.

To stop the containers, run:

```bash
docker compose down
```

### Docker Performance Tuning & Memory Footprint

The Docker deployment comes pre-configured for high-efficiency, low-memory operations:
- **V8 Engine Tuning**: Configured with `NODE_OPTIONS=--max-old-space-size=128` and `--optimize-for-size` command flag to keep Node.js idle RAM usage very low (~15–30 MB).
- **Streaming Proxy Pipeline**: Video stream chunks (`.m3u8`, `.ts`, `.mp4`) are piped directly through Web Streams without buffering full segments into heap memory, eliminating Garbage Collection spikes.
- **Nginx Caching & Buffering**: Static assets (`.js`, `.css`, images) are cached by Nginx with 1-year browser expiration headers, bypassing Node.js entirely.
