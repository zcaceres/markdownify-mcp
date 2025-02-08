import { createServer } from '../dist/server.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function testServer() {
  console.log('Starting server test...');
  
  try {
    const transport = new StdioServerTransport();
    const server = createServer();
    await server.connect(transport);
    
    // The server is now running and listening for requests
    console.log('Server started successfully');
    
    // You can test individual tools here
    // For example, testing the webpage-to-markdown tool:
    const response = await server.handleRequest({
      type: "CallTool",
      params: {
        name: "webpage-to-markdown",
        arguments: {
          url: "https://example.com"
        }
      }
    });
    
    console.log('Tool response:', response);
  } catch (error) {
    console.error('Server test failed:', error);
  }
}

testServer().catch(console.error);