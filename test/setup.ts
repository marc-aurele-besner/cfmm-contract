// Suppress FHEVM library debug messages during tests
const originalLog = console.log;
console.log = (...args: any[]) => {
  // Filter out FHEVM debug messages
  const message = args.join(" ");
  if (message.includes("HANDLE REVERT HERE!!")) {
    return; // Suppress this message
  }
  originalLog.apply(console, args);
};
