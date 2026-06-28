const NodeCache = require("node-cache");

const serverCache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 600,
  useClones: false,
  deleteOnExpire: true,
  maxKeys: 500,
});

module.exports = serverCache;
