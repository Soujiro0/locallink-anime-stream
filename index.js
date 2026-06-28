require("dotenv").config();
const express = require("express");
const path = require("path");
const apiRoutes = require("./src/routes/apiRoutes");
const proxyController = require("./src/controllers/proxyController");

const app = express();
app.disable("x-powered-by");

// Serve production build if exists with static asset caching
app.use(express.static(path.join(__dirname, "client", "dist"), {
  maxAge: "1y",
  etag: true,
  index: false,
}));
app.use(express.json());

// Mount API Routes
app.use("/api", apiRoutes);

// Mount Proxy Route
app.get("/proxy", proxyController.proxy);

// SPA fallback — serve React app for all other routes
app.use((req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

// Start server only when run directly (not imported for testing)
if (require.main === module) {
  const readline = require("readline");
  const net = require("net");

  const checkPort = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      server.once("listening", () => {
        server.close();
        resolve(true);
      });
      server.listen(port, "127.0.0.1");
    });
  };

  const defaultPort = parseInt(process.env.PORT, 10) || 3000;

  if (process.env.NO_PROMPT === "true") {
    const server = app.listen(defaultPort, "0.0.0.0", () => {
      console.log(`\n✅ Server successfully started on port ${defaultPort} (Non-interactive mode)`);
    });
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("==========================================");
    console.log(" Welcome to LocalLink Server! ");
    console.log("==========================================");
    console.log("Please specify the port to run the server on.");
    console.log("Valid ports are generally between 1024 and 65535.");
    console.log("------------------------------------------\n");

    const promptForPort = () => {
      rl.question("Enter port [Default: 3010]: ", async (answer) => {
        const input = answer.trim();
        const port = input === "" ? 3010 : parseInt(input, 10);

        if (isNaN(port) || port < 1024 || port > 65535) {
          console.log("❌ Invalid port. Please enter a valid number (1024 - 65535).\n");
          return promptForPort();
        }

        console.log(`Checking if port ${port} is available...`);
        const isFree = await checkPort(port);
        
        if (!isFree) {
          console.log(`❌ Port ${port} is currently in use! Please choose another port.\n`);
          return promptForPort();
        }

        const server = app.listen(port, () => {
          console.log("\n✅ Server successfully started!");
          console.log("==========================================");
          console.log("To access the platform, open your browser to:");
          console.log(`➔  http://localhost:${port}`);
          console.log("==========================================");
        });
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;
        rl.close();
      });
    };

    promptForPort();
  }
}

module.exports = app;
