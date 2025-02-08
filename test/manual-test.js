import { Markdownify } from '../dist/Markdownify.js';
import fs from 'fs/promises';
import path from 'path';

async function runTests() {
  console.log('Starting manual tests...');
  
  // Test 1: Basic text file
  try {
    await fs.writeFile('test.txt', 'Hello, this is a test file.');
    console.log('\nTest 1: Converting text file...');
    const result1 = await Markdownify.toMarkdown({
      filePath: './test.txt'
    });
    console.log('✓ Text file conversion successful');
    console.log('Output:', result1.text);
  } catch (error) {
    console.error('✗ Text file conversion failed:', error);
  }

  // Test 2: URL conversion
  try {
    console.log('\nTest 2: Converting URL...');
    const result2 = await Markdownify.toMarkdown({
      url: 'https://example.com'
    });
    console.log('✓ URL conversion successful');
    console.log('Output:', result2.text);
  } catch (error) {
    console.error('✗ URL conversion failed:', error);
  }

  // Test 3: Invalid file path
  try {
    console.log('\nTest 3: Testing invalid file path...');
    await Markdownify.toMarkdown({
      filePath: './nonexistent.txt'
    });
    console.error('✗ Should have failed but didn\'t');
  } catch (error) {
    console.log('✓ Correctly handled invalid file path');
  }

  // Test 4: Invalid URL
  try {
    console.log('\nTest 4: Testing invalid URL...');
    await Markdownify.toMarkdown({
      url: 'https://thisurldoesnotexist.example.com'
    });
    console.error('✗ Should have failed but didn\'t');
  } catch (error) {
    console.log('✓ Correctly handled invalid URL');
  }

  // Cleanup
  try {
    await fs.unlink('test.txt');
  } catch (e) {
    // Ignore cleanup errors
  }
}

runTests().catch(console.error);