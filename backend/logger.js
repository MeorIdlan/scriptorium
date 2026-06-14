function log(level, tag, message) {
  console.log(`[${new Date().toISOString()}] [${level}] [${tag}] ${message}`);
}

module.exports = {
  info:  (tag, msg) => log("INFO",  tag, msg),
  warn:  (tag, msg) => log("WARN",  tag, msg),
  error: (tag, msg) => log("ERROR", tag, msg),
};
