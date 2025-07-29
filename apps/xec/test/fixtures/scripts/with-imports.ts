// Test script with imports
export async function main() {
  console.log('Script with imports starting');
  
  // Test that module context is available
  if (globalThis.__xecModuleContext) {
    console.log('Module context available');
    
    try {
      // Test importing from CDN
      const dayjs = await globalThis.__xecModuleContext.importNPM('dayjs');
      console.log('dayjs imported:', !!dayjs);
    } catch (e) {
      console.log('Failed to import dayjs:', e.message);
    }
  } else {
    console.log('Module context not available');
  }
  
  return { success: true, message: 'Import test completed' };
}

const result = await main();
export { result };