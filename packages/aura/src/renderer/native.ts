import { RGBA } from "../lib/colors.js"
import { TextBuffer } from "./text-buffer.js"
import { OptimizedBuffer } from "./buffer.js";
import { CursorStyle, DebugOverlayCorner } from "../types.js"

export type Pointer = any;

let dlopen: (libPath: string, symbols: Record<string, any>) => any;
let toArrayBuffer: (ptr: Pointer, byteOffset?: number, byteLength?: number) => ArrayBuffer;
let readUint32Array: (ptr: Pointer, length: number) => Uint32Array;
let readFloat32Array: (ptr: Pointer, length: number) => Float32Array;
let readUint8Array: (ptr: Pointer, length: number) => Uint8Array;
let readUint16Array: (ptr: Pointer, length: number) => Uint16Array;

function isBun() {
  return typeof Bun !== "undefined"
}

export async function initializeNative() {
  if (isBun()) {
    const { dlopen: bunDlopen, toArrayBuffer: bunToArrayBuffer, } = await import("bun:ffi");
    dlopen = bunDlopen;
    toArrayBuffer = bunToArrayBuffer;

    // For Bun, use toArrayBuffer directly for typed arrays
    readUint32Array = (ptr: Pointer, length: number) => new Uint32Array(toArrayBuffer(ptr, 0, length * 4));
    readFloat32Array = (ptr: Pointer, length: number) => new Float32Array(toArrayBuffer(ptr, 0, length * 4));
    readUint8Array = (ptr: Pointer, length: number) => new Uint8Array(toArrayBuffer(ptr, 0, length));
    readUint16Array = (ptr: Pointer, length: number) => new Uint16Array(toArrayBuffer(ptr, 0, length * 2));
  } else {
    // Improved Koffi wrapper implementation
    try {
      // const util = await import('util');
      const koffiModule = await import('koffi');
      const koffi = koffiModule.default || koffiModule;

      // Define proper C types for better FFI compatibility
      const VoidPtr = koffi.pointer('void');

      // Convert bun:ffi type to koffi type
      const convertType = (type: string): any => {
        const typeMap: Record<string, any> = {
          'ptr': VoidPtr,
          'pointer': VoidPtr,
          'void': 'void',
          'bool': 'bool',
          'u8': 'uint8_t',
          'u16': 'uint16_t',
          'u32': 'uint32_t',
          'u64': 'uint64_t',
          'i8': 'int8_t',
          'i16': 'int16_t',
          'i32': 'int32_t',
          'i64': 'int64_t',
          'f32': 'float',
          'f64': 'double',
          'usize': 'size_t',
        };
        return typeMap[type] || type;
      };

      // Create dlopen wrapper
      dlopen = (libPath: string, symbols: Record<string, any>) => {
        // Load the library
        const lib = koffi.load(libPath);

        // Create symbol wrappers
        const wrappedSymbols: Record<string, any> = {};

        for (const [name, spec] of Object.entries(symbols)) {
          const returnType = convertType(spec.returns);
          const argTypes = spec.args.map((arg: string) => convertType(arg));

          // Define the function in koffi
          const funcDef = lib.func(name, returnType, argTypes);

          // Create wrapper to handle special cases
          wrappedSymbols[name] = (...args: any[]) => {
            // Convert arguments
            const convertedArgs = args.map((arg, index) => {
              const originalType = spec.args[index];

              // Handle pointer arguments with improved type conversion
              if (originalType === 'ptr' || originalType === 'pointer') {
                if (arg === null || arg === undefined) {
                  return null;
                }

                // if (name === 'setBackgroundColor') {
                //   console.log('Float32Array', arg, util.inspect(arg, { depth: 9, showHidden: true, showProxy: true }));
                // }

                // Handle RGBA (Float32Array with 4 elements) - Special case
                if (arg instanceof Float32Array && arg.length === 4) {
                  // Create a properly aligned buffer for RGBA
                  const buffer = Buffer.allocUnsafe(16); // 4 floats * 4 bytes
                  buffer.writeFloatLE(arg[0], 0);
                  buffer.writeFloatLE(arg[1], 4);
                  buffer.writeFloatLE(arg[2], 8);
                  buffer.writeFloatLE(arg[3], 12);

                  return buffer;
                }

                // Handle string
                if (typeof arg === 'string') {
                  // String to null-terminated C string
                  return Buffer.from(arg + '\0', 'utf-8');
                }

                // Handle Uint8Array (text bytes)
                if (arg instanceof Uint8Array) {
                  return Buffer.from(arg);
                }

                // Handle Uint32Array (border chars etc) or Float32Array (RGBA)
                if (arg instanceof Uint32Array || arg instanceof Float32Array) {
                  const buffer = Buffer.allocUnsafe(arg.length * 4);
                  for (let i = 0; i < arg.length; i++) {
                    buffer.writeUInt32LE(arg[i], i * 4);
                  }
                  return buffer;
                }

                // Handle buffer property (for RGBA objects with .buffer)
                if (arg && arg.buffer instanceof ArrayBuffer) {
                  // This handles typed arrays and RGBA objects
                  // if (arg.buffer.byteLength === 16) { // RGBA case
                  //   return Buffer.from(arg.buffer, arg.byteOffset || 0, 16);
                  // }
                  return Buffer.from(arg.buffer, arg.byteOffset || 0, arg.byteLength);
                }

                // Handle Buffer
                // if (Buffer.isBuffer(arg)) {
                //   return arg;
                // }

                // Return as-is for raw pointers or other types
                return arg;
              }

              // Handle usize (size_t) properly
              if (originalType === 'usize') {
                return Number(arg);
              }

              return arg;
            });



            // Call the native function
            const result = funcDef(...convertedArgs);

            // Return result as-is (pointers will be handled by read functions)
            return result;
          };
        }

        return { symbols: wrappedSymbols };
      };

      // koffi instance already stored above

      // Create toArrayBuffer wrapper with better type handling
      toArrayBuffer = (ptr: any, byteOffset?: number, byteLength?: number): ArrayBuffer => {
        if (!ptr) {
          throw new Error('Invalid pointer');
        }

        const offset = byteOffset || 0;

        if (byteLength === undefined) {
          throw new Error('byteLength is required for koffi toArrayBuffer');
        }

        try {
          // Koffi can return pointers in different formats
          // Handle each case appropriately

          // If ptr is already a Buffer (from koffi)
          if (Buffer.isBuffer(ptr)) {
            // Create a new buffer that shares the same memory
            const sliced = ptr.slice(offset, offset + byteLength);
            // Create ArrayBuffer from the slice
            const arrayBuffer = new ArrayBuffer(byteLength);
            const view = new Uint8Array(arrayBuffer);
            for (let i = 0; i < byteLength; i++) {
              view[i] = sliced[i];
            }
            return arrayBuffer;
          }

          // Try to read as raw bytes using koffi.read
          try {
            // Create a buffer type for the exact size we need
            const BufferType = koffi.array('uint8_t', byteLength);

            // Read the pointer as a byte array
            const decoded = koffi.decode(ptr, offset, BufferType);

            if (decoded instanceof Uint8Array) {
              // Already a Uint8Array, get its buffer
              return decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer;
            } else if (Array.isArray(decoded)) {

              // Regular array, convert to ArrayBuffer
              const arrayBuffer = new ArrayBuffer(byteLength);
              const view = new Uint8Array(arrayBuffer);
              for (let i = 0; i < decoded.length && i < byteLength; i++) {
                view[i] = decoded[i] & 0xFF; // Ensure byte value
              }
              return arrayBuffer;
            } else if (Buffer.isBuffer(decoded)) {
              // Node.js Buffer, convert to ArrayBuffer
              const arrayBuffer = new ArrayBuffer(byteLength);
              const view = new Uint8Array(arrayBuffer);
              for (let i = 0; i < byteLength; i++) {
                view[i] = decoded[i];
              }
              return arrayBuffer;
            }
          } catch (decodeError) {
            // If decode fails, try alternative method
            console.warn('koffi.decode failed, trying alternative:', decodeError);
          }

          // Try to read pointer as buffer address
          if (typeof ptr === 'bigint' || typeof ptr === 'number') {
            // Pointer is a memory address, we need to read from it
            // This is a fallback and may not work in all cases
            console.warn('Attempting to read from raw address:', ptr);
            const BufferType = koffi.array('uint8_t', byteLength);

            try {
              // Cast the address to a pointer and dereference
              const data = koffi.decode(ptr, offset, BufferType);
              if (data) {
                const arrayBuffer = new ArrayBuffer(byteLength);
                const view = new Uint8Array(arrayBuffer);
                if (data instanceof Uint8Array) {
                  view.set(data);
                } else if (Array.isArray(data)) {
                  for (let i = 0; i < data.length && i < byteLength; i++) {
                    view[i] = data[i] & 0xFF;
                  }
                }
                return arrayBuffer;
              }
            } catch (e) {
              console.warn('Failed to dereference pointer:', e);
            }
          }

          // Last resort: return zero-filled buffer
          console.warn('All methods failed, returning zero-filled buffer for byteLength:', byteLength);
          return new ArrayBuffer(byteLength);
        } catch (error) {
          console.error('toArrayBuffer error:', error);
          // Return zero-filled buffer as fallback
          return new ArrayBuffer(byteLength);
        }
      };

      // Create specialized readers for different array types using koffi.read
      readUint32Array = (ptr: Pointer, length: number): Uint32Array => {
        if (!ptr || length === 0) return new Uint32Array(0);

        try {
          // Use koffi.read instead of decode for better compatibility
          const Uint32ArrayType = koffi.array('uint32_t', length);
          const data = koffi.decode(ptr, Uint32ArrayType);

          if (data instanceof Uint32Array) {
            return data;
          } else if (Array.isArray(data)) {
            return new Uint32Array(data);
          } else if (Buffer.isBuffer(data)) {
            // Convert Buffer to Uint32Array
            const arrayBuffer = new ArrayBuffer(length * 4);
            const view = new DataView(arrayBuffer);
            for (let i = 0; i < length; i++) {
              view.setUint32(i * 4, data.readUInt32LE(i * 4), true);
            }
            return new Uint32Array(arrayBuffer);
          } else {
            // Fallback to byte reading
            const buffer = toArrayBuffer(ptr, 0, length * 4);
            return new Uint32Array(buffer);
          }
        } catch (e) {
          console.warn('readUint32Array failed, using fallback:', e);
          const buffer = toArrayBuffer(ptr, 0, length * 4);
          return new Uint32Array(buffer);
        }
      };

      readFloat32Array = (ptr: Pointer, length: number): Float32Array => {
        if (!ptr || length === 0) return new Float32Array(0);

        try {
          // Use koffi.read for better compatibility
          const FloatArrayType = koffi.array('float', length);
          const data = koffi.decode(ptr, FloatArrayType);

          if (data instanceof Float32Array) {
            return data;
          } else if (Array.isArray(data)) {
            return new Float32Array(data);
          } else if (Buffer.isBuffer(data)) {
            // Convert Buffer to Float32Array
            const arrayBuffer = new ArrayBuffer(length * 4);
            const view = new DataView(arrayBuffer);
            for (let i = 0; i < length; i++) {
              view.setFloat32(i * 4, data.readFloatLE(i * 4), true);
            }
            return new Float32Array(arrayBuffer);
          } else {
            // Fallback to byte reading
            const buffer = toArrayBuffer(ptr, 0, length * 4);
            return new Float32Array(buffer);
          }
        } catch (e) {
          console.warn('readFloat32Array failed, using fallback:', e);
          const buffer = toArrayBuffer(ptr, 0, length * 4);
          return new Float32Array(buffer);
        }
      };

      readUint8Array = (ptr: Pointer, length: number): Uint8Array => {
        if (!ptr || length === 0) return new Uint8Array(0);

        try {
          // Use koffi.read for better compatibility
          const Uint8ArrayType = koffi.array('uint8_t', length);
          const data = koffi.decode(ptr, Uint8ArrayType);

          if (data instanceof Uint8Array) {
            return data;
          } else if (Array.isArray(data)) {
            return new Uint8Array(data);
          } else if (Buffer.isBuffer(data)) {
            return new Uint8Array(data);
          } else {
            // Fallback to byte reading
            const buffer = toArrayBuffer(ptr, 0, length);
            return new Uint8Array(buffer);
          }
        } catch (e) {
          console.warn('readUint8Array failed, using fallback:', e);
          const buffer = toArrayBuffer(ptr, 0, length);
          return new Uint8Array(buffer);
        }
      };

      readUint16Array = (ptr: Pointer, length: number): Uint16Array => {
        if (!ptr || length === 0) return new Uint16Array(0);

        try {
          // Use koffi.read for better compatibility
          const Uint16ArrayType = koffi.array('uint16_t', length);
          const data = koffi.decode(ptr, Uint16ArrayType);

          if (data instanceof Uint16Array) {
            return data;
          } else if (Array.isArray(data)) {
            return new Uint16Array(data);
          } else if (Buffer.isBuffer(data)) {
            // Convert Buffer to Uint16Array
            const arrayBuffer = new ArrayBuffer(length * 2);
            const view = new DataView(arrayBuffer);
            for (let i = 0; i < length; i++) {
              view.setUint16(i * 2, data.readUInt16LE(i * 2), true);
            }
            return new Uint16Array(arrayBuffer);
          } else {
            // Fallback to byte reading
            const buffer = toArrayBuffer(ptr, 0, length * 2);
            return new Uint16Array(buffer);
          }
        } catch (e) {
          console.warn('readUint16Array failed, using fallback:', e);
          const buffer = toArrayBuffer(ptr, 0, length * 2);
          return new Uint16Array(buffer);
        }
      };

    } catch (error) {
      console.error('Failed to initialize koffi:', error);
      throw new Error('koffi is required for non-Bun environments. Please install it: npm install koffi');
    }
  }
}

function getOpenTUILib() {
  return dlopen(`./rust/target/release/libopentui.dylib`, {
    // Renderer management
    createRenderer: {
      args: ["u32", "u32", "bool"],
      returns: "ptr",
    },
    destroyRenderer: {
      args: ["ptr", "bool"],
      returns: "void",
    },
    setUseThread: {
      args: ["ptr", "bool"],
      returns: "void",
    },
    setBackgroundColor: {
      args: ["ptr", "ptr"],
      returns: "void",
    },
    setRenderOffset: {
      args: ["ptr", "u32"],
      returns: "void",
    },
    updateStats: {
      args: ["ptr", "f64", "u32", "f64", "f64"],
      returns: "void",
    },
    updateMemoryStats: {
      args: ["ptr", "u32", "u32", "u32"],
      returns: "void",
    },
    render: {
      args: ["ptr", "bool"],
      returns: "void",
    },
    getNextBuffer: {
      args: ["ptr"],
      returns: "ptr",
    },
    getCurrentBuffer: {
      args: ["ptr"],
      returns: "ptr",
    },

    createOptimizedBuffer: {
      args: ["u32", "u32", "bool"],
      returns: "ptr",
    },
    destroyOptimizedBuffer: {
      args: ["ptr"],
      returns: "void",
    },

    drawFrameBuffer: {
      args: ["ptr", "i32", "i32", "ptr", "u32", "u32", "u32", "u32"],
      returns: "void",
    },
    getBufferWidth: {
      args: ["ptr"],
      returns: "u32",
    },
    getBufferHeight: {
      args: ["ptr"],
      returns: "u32",
    },
    bufferClear: {
      args: ["ptr", "ptr"],
      returns: "void",
    },
    bufferGetCharPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    bufferGetFgPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    bufferGetBgPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    bufferGetAttributesPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    bufferGetRespectAlpha: {
      args: ["ptr"],
      returns: "bool",
    },
    bufferSetRespectAlpha: {
      args: ["ptr", "bool"],
      returns: "void",
    },

    bufferDrawText: {
      args: ["ptr", "ptr", "usize", "u32", "u32", "ptr", "ptr", "u8"],
      returns: "void",
    },
    bufferSetCellWithAlphaBlending: {
      args: ["ptr", "u32", "u32", "u32", "ptr", "ptr", "u8"],
      returns: "void",
    },
    bufferFillRect: {
      args: ["ptr", "u32", "u32", "u32", "u32", "ptr"],
      returns: "void",
    },
    bufferResize: {
      args: ["ptr", "u32", "u32"],
      returns: "void",
    },

    resizeRenderer: {
      args: ["ptr", "u32", "u32"],
      returns: "void",
    },

    setLinesRendered: {
      args: ["ptr", "u32"],
      returns: "void",
    },

    // Global cursor functions
    setCursorPosition: {
      args: ["i32", "i32", "bool"],
      returns: "void",
    },
    setCursorStyle: {
      args: ["ptr", "usize", "bool"],  // Fixed: should be usize not u32
      returns: "void",
    },
    setCursorColor: {
      args: ["ptr"],
      returns: "void",
    },

    // Debug overlay
    setDebugOverlay: {
      args: ["ptr", "bool", "u8"],
      returns: "void",
    },

    // Terminal control
    clearTerminal: {
      args: ["ptr"],
      returns: "void",
    },

    bufferDrawSuperSampleBuffer: {
      args: ["ptr", "u32", "u32", "ptr", "usize", "u8", "u32"],
      returns: "void",
    },
    bufferDrawPackedBuffer: {
      args: ["ptr", "ptr", "usize", "u32", "u32", "u32", "u32"],
      returns: "void",
    },
    bufferDrawBox: {
      args: ["ptr", "i32", "i32", "u32", "u32", "ptr", "u32", "ptr", "ptr", "ptr", "usize"],
      returns: "void",
    },

    addToHitGrid: {
      args: ["ptr", "i32", "i32", "u32", "u32", "u32"],
      returns: "void",
    },
    checkHit: {
      args: ["ptr", "u32", "u32"],
      returns: "u32",
    },
    dumpHitGrid: {
      args: ["ptr"],
      returns: "void",
    },
    dumpBuffers: {
      args: ["ptr", "i64"],
      returns: "void",
    },
    dumpStdoutBuffer: {
      args: ["ptr", "i64"],
      returns: "void",
    },
    enableMouse: {
      args: ["ptr", "bool"],
      returns: "void",
    },
    disableMouse: {
      args: ["ptr"],
      returns: "void",
    },

    // TextBuffer functions
    createTextBuffer: {
      args: ["u32"],
      returns: "ptr",
    },
    destroyTextBuffer: {
      args: ["ptr"],
      returns: "void",
    },
    textBufferGetCharPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    textBufferGetFgPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    textBufferGetBgPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    textBufferGetAttributesPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    textBufferGetLength: {
      args: ["ptr"],
      returns: "u32",
    },
    textBufferSetCell: {
      args: ["ptr", "u32", "u32", "ptr", "ptr", "u16"],
      returns: "void",
    },
    textBufferConcat: {
      args: ["ptr", "ptr"],
      returns: "ptr",
    },
    textBufferResize: {
      args: ["ptr", "u32"],
      returns: "void",
    },
    textBufferReset: {
      args: ["ptr"],
      returns: "void",
    },
    textBufferSetSelection: {
      args: ["ptr", "u32", "u32", "ptr", "ptr"],
      returns: "void",
    },
    textBufferResetSelection: {
      args: ["ptr"],
      returns: "void",
    },
    textBufferSetDefaultFg: {
      args: ["ptr", "ptr"],
      returns: "void",
    },
    textBufferSetDefaultBg: {
      args: ["ptr", "ptr"],
      returns: "void",
    },
    textBufferSetDefaultAttributes: {
      args: ["ptr", "ptr"],
      returns: "void",
    },
    textBufferResetDefaults: {
      args: ["ptr"],
      returns: "void",
    },
    textBufferWriteChunk: {
      args: ["ptr", "ptr", "u32", "ptr", "ptr", "ptr"],
      returns: "u32",
    },
    textBufferGetCapacity: {
      args: ["ptr"],
      returns: "u32",
    },
    textBufferFinalizeLineInfo: {
      args: ["ptr"],
      returns: "void",
    },
    textBufferGetLineStartsPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    textBufferGetLineWidthsPtr: {
      args: ["ptr"],
      returns: "ptr",
    },
    textBufferGetLineCount: {
      args: ["ptr"],
      returns: "u32",
    },
    bufferDrawTextBuffer: {
      args: ["ptr", "ptr", "i32", "i32", "i32", "i32", "u32", "u32", "bool"],
      returns: "void",
    },
  })
}

export interface RenderLib {
  createRenderer: (width: number, height: number, useAlternateScreen: boolean) => Pointer | null
  destroyRenderer: (renderer: Pointer, useAlternateScreen: boolean/*, splitHeight: number*/) => void
  setUseThread: (renderer: Pointer, useThread: boolean) => void
  setBackgroundColor: (renderer: Pointer, color: RGBA) => void
  setRenderOffset: (renderer: Pointer, offset: number) => void
  updateStats: (renderer: Pointer, time: number, fps: number, frameCallbackTime: number, animationRequestTime: number) => void
  updateMemoryStats: (renderer: Pointer, heapUsed: number, heapTotal: number, arrayBuffers: number) => void
  render: (renderer: Pointer, force: boolean) => void
  getNextBuffer: (renderer: Pointer) => OptimizedBuffer
  getCurrentBuffer: (renderer: Pointer) => OptimizedBuffer
  createOptimizedBuffer: (width: number, height: number, respectAlpha?: boolean) => OptimizedBuffer
  destroyOptimizedBuffer: (bufferPtr: Pointer) => void
  drawFrameBuffer: (
    targetBufferPtr: Pointer,
    destX: number,
    destY: number,
    bufferPtr: Pointer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ) => void
  getBufferWidth: (buffer: Pointer) => number
  getBufferHeight: (buffer: Pointer) => number
  bufferClear: (buffer: Pointer, color: RGBA) => void
  bufferGetCharPtr: (buffer: Pointer) => Pointer
  bufferGetFgPtr: (buffer: Pointer) => Pointer
  bufferGetBgPtr: (buffer: Pointer) => Pointer
  bufferGetAttributesPtr: (buffer: Pointer) => Pointer
  bufferGetRespectAlpha: (buffer: Pointer) => boolean
  bufferSetRespectAlpha: (buffer: Pointer, respectAlpha: boolean) => void
  bufferDrawText: (
    buffer: Pointer,
    text: string,
    x: number,
    y: number,
    color: RGBA,
    bgColor?: RGBA,
    attributes?: number,
  ) => void
  bufferSetCellWithAlphaBlending: (
    buffer: Pointer,
    x: number,
    y: number,
    char: string,
    color: RGBA,
    bgColor: RGBA,
    attributes?: number,
  ) => void
  bufferFillRect: (buffer: Pointer, x: number, y: number, width: number, height: number, color: RGBA) => void
  bufferDrawSuperSampleBuffer: (
    buffer: Pointer,
    x: number,
    y: number,
    pixelDataPtr: Pointer,
    pixelDataLength: number,
    format: "bgra8unorm" | "rgba8unorm",
    alignedBytesPerRow: number,
  ) => void
  bufferDrawPackedBuffer: (
    buffer: Pointer,
    dataPtr: Pointer,
    dataLen: number,
    posX: number,
    posY: number,
    terminalWidthCells: number,
    terminalHeightCells: number,
  ) => void
  bufferDrawBox: (
    buffer: Pointer,
    x: number,
    y: number,
    width: number,
    height: number,
    borderChars: Uint32Array,
    packedOptions: number,
    borderColor: RGBA,
    backgroundColor: RGBA,
    title: string | null,
  ) => void
  bufferResize: (
    buffer: Pointer,
    width: number,
    height: number,
  ) => {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint8Array
  }
  resizeRenderer: (renderer: Pointer, width: number, height: number) => void
  setLinesRendered: (renderer: Pointer, lines: number) => void
  setCursorPosition: (x: number, y: number, visible: boolean) => void
  setCursorStyle: (style: CursorStyle, blinking: boolean) => void
  setCursorColor: (color: RGBA) => void
  setDebugOverlay: (renderer: Pointer, enabled: boolean, corner: DebugOverlayCorner) => void
  clearTerminal: (renderer: Pointer) => void
  addToHitGrid: (renderer: Pointer, x: number, y: number, width: number, height: number, id: number) => void
  checkHit: (renderer: Pointer, x: number, y: number) => number
  dumpHitGrid: (renderer: Pointer) => void
  dumpBuffers: (renderer: Pointer, timestamp?: number) => void
  dumpStdoutBuffer: (renderer: Pointer, timestamp?: number) => void
  enableMouse: (renderer: Pointer, enableMovement: boolean) => void
  disableMouse: (renderer: Pointer) => void

  // TextBuffer methods
  createTextBuffer: (capacity: number) => TextBuffer
  destroyTextBuffer: (buffer: Pointer) => void
  textBufferGetCharPtr: (buffer: Pointer) => Pointer
  textBufferGetFgPtr: (buffer: Pointer) => Pointer
  textBufferGetBgPtr: (buffer: Pointer) => Pointer
  textBufferGetAttributesPtr: (buffer: Pointer) => Pointer
  textBufferGetLength: (buffer: Pointer) => number
  textBufferSetCell: (
    buffer: Pointer,
    index: number,
    char: number,
    fg: Float32Array,
    bg: Float32Array,
    attr: number,
  ) => void
  textBufferConcat: (buffer1: Pointer, buffer2: Pointer) => TextBuffer
  textBufferResize: (
    buffer: Pointer,
    newLength: number,
  ) => {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint16Array
  }
  textBufferReset: (buffer: Pointer) => void
  textBufferSetSelection: (
    buffer: Pointer,
    start: number,
    end: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
  ) => void
  textBufferResetSelection: (buffer: Pointer) => void
  textBufferSetDefaultFg: (buffer: Pointer, fg: RGBA | null) => void
  textBufferSetDefaultBg: (buffer: Pointer, bg: RGBA | null) => void
  textBufferSetDefaultAttributes: (buffer: Pointer, attributes: number | null) => void
  textBufferResetDefaults: (buffer: Pointer) => void
  textBufferWriteChunk: (
    buffer: Pointer,
    textBytes: Uint8Array,
    fg: RGBA | null,
    bg: RGBA | null,
    attributes: number | null,
  ) => number
  textBufferGetCapacity: (buffer: Pointer) => number
  textBufferFinalizeLineInfo: (buffer: Pointer) => void
  textBufferGetLineInfo: (buffer: Pointer) => { lineStarts: number[]; lineWidths: number[] }
  getTextBufferArrays: (
    buffer: Pointer,
    size: number,
  ) => {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint16Array
  }
  bufferDrawTextBuffer: (
    buffer: Pointer,
    textBuffer: Pointer,
    x: number,
    y: number,
    clipRect?: { x: number; y: number; width: number; height: number },
  ) => void
}

class FFIRenderLib implements RenderLib {
  private opentui: ReturnType<typeof getOpenTUILib>
  private encoder: TextEncoder = new TextEncoder()

  constructor() {
    this.opentui = getOpenTUILib()
  }

  public createRenderer(width: number, height: number, useAlternateScreen: boolean = true) {
    return this.opentui.symbols.createRenderer(width, height, useAlternateScreen)
  }

  public destroyRenderer(renderer: Pointer, useAlternateScreen: boolean/*, splitHeight: number*/) {
    this.opentui.symbols.destroyRenderer(renderer, useAlternateScreen/*, splitHeight*/)
  }

  public setUseThread(renderer: Pointer, useThread: boolean) {
    this.opentui.symbols.setUseThread(renderer, useThread)
  }

  public setBackgroundColor(renderer: Pointer, color: RGBA) {
    this.opentui.symbols.setBackgroundColor(renderer, color.buffer)
  }

  public setRenderOffset(renderer: Pointer, offset: number) {
    this.opentui.symbols.setRenderOffset(renderer, offset)
  }

  public updateStats(renderer: Pointer, time: number, fps: number, frameCallbackTime: number, animationRequestTime: number) {
    this.opentui.symbols.updateStats(renderer, time, fps, frameCallbackTime, animationRequestTime)
  }

  public updateMemoryStats(renderer: Pointer, heapUsed: number, heapTotal: number, arrayBuffers: number) {
    this.opentui.symbols.updateMemoryStats(renderer, heapUsed, heapTotal, arrayBuffers)
  }

  public getNextBuffer(renderer: Pointer): OptimizedBuffer {
    const bufferPtr = this.opentui.symbols.getNextBuffer(renderer)
    if (!bufferPtr) {
      throw new Error("Failed to get next buffer")
    }

    const width = this.opentui.symbols.getBufferWidth(bufferPtr)
    const height = this.opentui.symbols.getBufferHeight(bufferPtr)
    const size = width * height
    const buffers = this.getBuffer(bufferPtr, size)

    return new OptimizedBuffer(this, bufferPtr, buffers, width, height, {})
  }

  public getCurrentBuffer(renderer: Pointer): OptimizedBuffer {
    const bufferPtr = this.opentui.symbols.getCurrentBuffer(renderer)
    if (!bufferPtr) {
      throw new Error("Failed to get current buffer")
    }

    const width = this.opentui.symbols.getBufferWidth(bufferPtr)
    const height = this.opentui.symbols.getBufferHeight(bufferPtr)
    const size = width * height
    const buffers = this.getBuffer(bufferPtr, size)

    return new OptimizedBuffer(this, bufferPtr, buffers, width, height, {})
  }

  private getBuffer(
    bufferPtr: Pointer,
    size: number,
  ): {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint8Array
  } {
    const charPtr = this.opentui.symbols.bufferGetCharPtr(bufferPtr)
    const fgPtr = this.opentui.symbols.bufferGetFgPtr(bufferPtr)
    const bgPtr = this.opentui.symbols.bufferGetBgPtr(bufferPtr)
    const attributesPtr = this.opentui.symbols.bufferGetAttributesPtr(bufferPtr)

    if (!charPtr || !fgPtr || !bgPtr || !attributesPtr) {
      throw new Error("Failed to get buffer pointers")
    }

    // Use specialized readers for better type handling
    const buffers = {
      char: readUint32Array(charPtr, size),
      fg: readFloat32Array(fgPtr, size * 4), // 4 floats per RGBA
      bg: readFloat32Array(bgPtr, size * 4), // 4 floats per RGBA
      attributes: readUint8Array(attributesPtr, size),
    }

    return buffers
  }

  private getTextBuffer(
    bufferPtr: Pointer,
    size: number,
  ): {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint16Array
  } {
    const charPtr = this.opentui.symbols.textBufferGetCharPtr(bufferPtr)
    const fgPtr = this.opentui.symbols.textBufferGetFgPtr(bufferPtr)
    const bgPtr = this.opentui.symbols.textBufferGetBgPtr(bufferPtr)
    const attributesPtr = this.opentui.symbols.textBufferGetAttributesPtr(bufferPtr)

    if (!charPtr || !fgPtr || !bgPtr || !attributesPtr) {
      throw new Error("Failed to get text buffer pointers")
    }

    // Use specialized readers for better type handling
    const buffers = {
      char: readUint32Array(charPtr, size),
      fg: readFloat32Array(fgPtr, size * 4), // 4 floats per RGBA
      bg: readFloat32Array(bgPtr, size * 4), // 4 floats per RGBA
      attributes: readUint16Array(attributesPtr, size),
    }

    return buffers
  }

  public bufferGetCharPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.bufferGetCharPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get char pointer")
    }
    return ptr
  }

  public bufferGetFgPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.bufferGetFgPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get fg pointer")
    }
    return ptr
  }

  public bufferGetBgPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.bufferGetBgPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get bg pointer")
    }
    return ptr
  }

  public bufferGetAttributesPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.bufferGetAttributesPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get attributes pointer")
    }
    return ptr
  }

  public bufferGetRespectAlpha(buffer: Pointer): boolean {
    return this.opentui.symbols.bufferGetRespectAlpha(buffer)
  }

  public bufferSetRespectAlpha(buffer: Pointer, respectAlpha: boolean): void {
    this.opentui.symbols.bufferSetRespectAlpha(buffer, respectAlpha)
  }

  public getBufferWidth(buffer: Pointer): number {
    return this.opentui.symbols.getBufferWidth(buffer)
  }

  public getBufferHeight(buffer: Pointer): number {
    return this.opentui.symbols.getBufferHeight(buffer)
  }

  public bufferClear(buffer: Pointer, color: RGBA) {
    this.opentui.symbols.bufferClear(buffer, color.buffer)
  }

  public bufferDrawText(
    buffer: Pointer,
    text: string,
    x: number,
    y: number,
    color: RGBA,
    bgColor?: RGBA,
    attributes?: number,
  ) {
    const textBytes = this.encoder.encode(text)
    const textLength = textBytes.byteLength
    const bg = bgColor ? bgColor.buffer : null
    const fg = color.buffer

    this.opentui.symbols.bufferDrawText(buffer, textBytes, textLength, x, y, fg, bg, attributes ?? 0)
  }

  public bufferSetCellWithAlphaBlending(
    buffer: Pointer,
    x: number,
    y: number,
    char: string,
    color: RGBA,
    bgColor: RGBA,
    attributes?: number,
  ) {
    const charPtr = char.codePointAt(0) ?? " ".codePointAt(0)!
    const bg = bgColor.buffer
    const fg = color.buffer

    this.opentui.symbols.bufferSetCellWithAlphaBlending(buffer, x, y, charPtr, fg, bg, attributes ?? 0)
  }

  public bufferFillRect(buffer: Pointer, x: number, y: number, width: number, height: number, color: RGBA) {
    const bg = color.buffer
    this.opentui.symbols.bufferFillRect(buffer, x, y, width, height, bg)
  }

  public bufferDrawSuperSampleBuffer(
    buffer: Pointer,
    x: number,
    y: number,
    pixelDataPtr: Pointer,
    pixelDataLength: number,
    format: "bgra8unorm" | "rgba8unorm",
    alignedBytesPerRow: number,
  ): void {
    const formatId = format === "bgra8unorm" ? 0 : 1
    this.opentui.symbols.bufferDrawSuperSampleBuffer(
      buffer,
      x,
      y,
      pixelDataPtr,
      pixelDataLength,
      formatId,
      alignedBytesPerRow,
    )
  }

  public bufferDrawPackedBuffer(
    buffer: Pointer,
    dataPtr: Pointer,
    dataLen: number,
    posX: number,
    posY: number,
    terminalWidthCells: number,
    terminalHeightCells: number,
  ): void {
    this.opentui.symbols.bufferDrawPackedBuffer(
      buffer,
      dataPtr,
      dataLen,
      posX,
      posY,
      terminalWidthCells,
      terminalHeightCells,
    )
  }

  public bufferDrawBox(
    buffer: Pointer,
    x: number,
    y: number,
    width: number,
    height: number,
    borderChars: Uint32Array,
    packedOptions: number,
    borderColor: RGBA,
    backgroundColor: RGBA,
    title: string | null,
  ): void {
    const titleBytes = title ? this.encoder.encode(title) : null
    const titleLen = title ? titleBytes!.length : 0
    const titlePtr = title ? titleBytes : null

    this.opentui.symbols.bufferDrawBox(
      buffer,
      x,
      y,
      width,
      height,
      borderChars,
      packedOptions,
      borderColor.buffer,
      backgroundColor.buffer,
      titlePtr,
      titleLen,
    )
  }

  public bufferResize(
    buffer: Pointer,
    width: number,
    height: number,
  ): {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint8Array
  } {
    this.opentui.symbols.bufferResize(buffer, width, height)
    const buffers = this.getBuffer(buffer, width * height)
    return buffers
  }

  public resizeRenderer(renderer: Pointer, width: number, height: number) {
    this.opentui.symbols.resizeRenderer(renderer, width, height)
  }

  public setLinesRendered(renderer: Pointer, lines: number) {
    this.opentui.symbols.setLinesRendered(renderer, lines)
  }

  public setCursorPosition(x: number, y: number, visible: boolean) {
    this.opentui.symbols.setCursorPosition(x, y, visible)
  }

  public setCursorStyle(style: CursorStyle, blinking: boolean) {
    const stylePtr = this.encoder.encode(style)
    this.opentui.symbols.setCursorStyle(stylePtr, stylePtr.length, blinking)  // Fixed: use stylePtr.length
  }

  public setCursorColor(color: RGBA) {
    this.opentui.symbols.setCursorColor(color.buffer)
  }

  public render(renderer: Pointer, force: boolean) {
    this.opentui.symbols.render(renderer, force)
  }

  public createOptimizedBuffer(width: number, height: number, respectAlpha: boolean = false): OptimizedBuffer {
    if (Number.isNaN(width) || Number.isNaN(height)) {
      console.error(new Error(`Invalid dimensions for OptimizedBuffer: ${width}x${height}`).stack)
    }

    const bufferPtr = this.opentui.symbols.createOptimizedBuffer(width, height, respectAlpha)
    if (!bufferPtr) {
      throw new Error(`Failed to create optimized buffer: ${width}x${height}`)
    }
    const size = width * height
    const buffers = this.getBuffer(bufferPtr, size)

    return new OptimizedBuffer(this, bufferPtr, buffers, width, height, { respectAlpha })
  }

  public destroyOptimizedBuffer(bufferPtr: Pointer) {
    this.opentui.symbols.destroyOptimizedBuffer(bufferPtr)
  }

  public drawFrameBuffer(
    targetBufferPtr: Pointer,
    destX: number,
    destY: number,
    bufferPtr: Pointer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ) {
    const srcX = sourceX ?? 0
    const srcY = sourceY ?? 0
    const srcWidth = sourceWidth ?? 0
    const srcHeight = sourceHeight ?? 0
    this.opentui.symbols.drawFrameBuffer(targetBufferPtr, destX, destY, bufferPtr, srcX, srcY, srcWidth, srcHeight)
  }

  public setDebugOverlay(renderer: Pointer, enabled: boolean, corner: DebugOverlayCorner) {
    this.opentui.symbols.setDebugOverlay(renderer, enabled, corner)
  }

  public clearTerminal(renderer: Pointer) {
    this.opentui.symbols.clearTerminal(renderer)
  }

  public addToHitGrid(renderer: Pointer, x: number, y: number, width: number, height: number, id: number) {
    this.opentui.symbols.addToHitGrid(renderer, x, y, width, height, id)
  }

  public checkHit(renderer: Pointer, x: number, y: number): number {
    return this.opentui.symbols.checkHit(renderer, x, y)
  }

  public dumpHitGrid(renderer: Pointer): void {
    this.opentui.symbols.dumpHitGrid(renderer)
  }

  public dumpBuffers(renderer: Pointer, timestamp?: number): void {
    const ts = timestamp ?? Date.now()
    this.opentui.symbols.dumpBuffers(renderer, ts)
  }

  public dumpStdoutBuffer(renderer: Pointer, timestamp?: number): void {
    const ts = timestamp ?? Date.now()
    this.opentui.symbols.dumpStdoutBuffer(renderer, ts)
  }

  public enableMouse(renderer: Pointer, enableMovement: boolean): void {
    this.opentui.symbols.enableMouse(renderer, enableMovement)
  }

  public disableMouse(renderer: Pointer): void {
    this.opentui.symbols.disableMouse(renderer)
  }

  // TextBuffer methods
  public createTextBuffer(capacity: number): TextBuffer {
    const bufferPtr = this.opentui.symbols.createTextBuffer(capacity)
    if (!bufferPtr) {
      throw new Error(`Failed to create TextBuffer with capacity ${capacity}`)
    }

    const charPtr = this.textBufferGetCharPtr(bufferPtr)
    const fgPtr = this.textBufferGetFgPtr(bufferPtr)
    const bgPtr = this.textBufferGetBgPtr(bufferPtr)
    const attributesPtr = this.textBufferGetAttributesPtr(bufferPtr)

    // Use specialized readers for better type handling
    const buffer = {
      char: readUint32Array(charPtr, capacity),
      fg: readFloat32Array(fgPtr, capacity * 4), // 4 floats per RGBA
      bg: readFloat32Array(bgPtr, capacity * 4), // 4 floats per RGBA
      attributes: readUint16Array(attributesPtr, capacity),
    }

    return new TextBuffer(this, bufferPtr, buffer, capacity)
  }

  public destroyTextBuffer(buffer: Pointer): void {
    this.opentui.symbols.destroyTextBuffer(buffer)
  }

  public textBufferGetCharPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.textBufferGetCharPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get TextBuffer char pointer")
    }
    return ptr
  }

  public textBufferGetFgPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.textBufferGetFgPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get TextBuffer fg pointer")
    }
    return ptr
  }

  public textBufferGetBgPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.textBufferGetBgPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get TextBuffer bg pointer")
    }
    return ptr
  }

  public textBufferGetAttributesPtr(buffer: Pointer): Pointer {
    const ptr = this.opentui.symbols.textBufferGetAttributesPtr(buffer)
    if (!ptr) {
      throw new Error("Failed to get TextBuffer attributes pointer")
    }
    return ptr
  }

  public textBufferGetLength(buffer: Pointer): number {
    return this.opentui.symbols.textBufferGetLength(buffer)
  }

  public textBufferSetCell(
    buffer: Pointer,
    index: number,
    char: number,
    fg: Float32Array,
    bg: Float32Array,
    attr: number,
  ): void {
    this.opentui.symbols.textBufferSetCell(buffer, index, char, fg, bg, attr)
  }

  public textBufferConcat(buffer1: Pointer, buffer2: Pointer): TextBuffer {
    const resultPtr = this.opentui.symbols.textBufferConcat(buffer1, buffer2)
    if (!resultPtr) {
      throw new Error("Failed to concatenate TextBuffers")
    }

    const length = this.textBufferGetLength(resultPtr)
    const charPtr = this.textBufferGetCharPtr(resultPtr)
    const fgPtr = this.textBufferGetFgPtr(resultPtr)
    const bgPtr = this.textBufferGetBgPtr(resultPtr)
    const attributesPtr = this.textBufferGetAttributesPtr(resultPtr)

    // Use specialized readers for better type handling
    const buffer = {
      char: readUint32Array(charPtr, length),
      fg: readFloat32Array(fgPtr, length * 4), // 4 floats per RGBA
      bg: readFloat32Array(bgPtr, length * 4), // 4 floats per RGBA
      attributes: readUint16Array(attributesPtr, length),
    }

    return new TextBuffer(this, resultPtr, buffer, length)
  }

  public textBufferResize(
    buffer: Pointer,
    newLength: number,
  ): {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint16Array
  } {
    this.opentui.symbols.textBufferResize(buffer, newLength)
    const buffers = this.getTextBuffer(buffer, newLength)
    return buffers
  }

  public textBufferReset(buffer: Pointer): void {
    this.opentui.symbols.textBufferReset(buffer)
  }

  public textBufferSetSelection(
    buffer: Pointer,
    start: number,
    end: number,
    bgColor: RGBA | null,
    fgColor: RGBA | null,
  ): void {
    const bg = bgColor ? bgColor.buffer : null
    const fg = fgColor ? fgColor.buffer : null
    this.opentui.symbols.textBufferSetSelection(buffer, start, end, bg, fg)
  }

  public textBufferResetSelection(buffer: Pointer): void {
    this.opentui.symbols.textBufferResetSelection(buffer)
  }

  public textBufferSetDefaultFg(buffer: Pointer, fg: RGBA | null): void {
    const fgPtr = fg ? fg.buffer : null
    this.opentui.symbols.textBufferSetDefaultFg(buffer, fgPtr)
  }

  public textBufferSetDefaultBg(buffer: Pointer, bg: RGBA | null): void {
    const bgPtr = bg ? bg.buffer : null
    this.opentui.symbols.textBufferSetDefaultBg(buffer, bgPtr)
  }

  public textBufferSetDefaultAttributes(buffer: Pointer, attributes: number | null): void {
    const attrValue = attributes === null ? null : new Uint8Array([attributes])
    this.opentui.symbols.textBufferSetDefaultAttributes(buffer, attrValue)
  }

  public textBufferResetDefaults(buffer: Pointer): void {
    this.opentui.symbols.textBufferResetDefaults(buffer)
  }

  public textBufferWriteChunk(
    buffer: Pointer,
    textBytes: Uint8Array,
    fg: RGBA | null,
    bg: RGBA | null,
    attributes: number | null,
  ): number {
    const attrValue = attributes === null ? null : new Uint8Array([attributes])
    return this.opentui.symbols.textBufferWriteChunk(
      buffer,
      textBytes,
      textBytes.length,
      fg ? fg.buffer : null,
      bg ? bg.buffer : null,
      attrValue,
    )
  }

  public textBufferGetCapacity(buffer: Pointer): number {
    return this.opentui.symbols.textBufferGetCapacity(buffer)
  }

  public textBufferFinalizeLineInfo(buffer: Pointer): void {
    this.opentui.symbols.textBufferFinalizeLineInfo(buffer)
  }

  public textBufferGetLineInfo(buffer: Pointer): { lineStarts: number[]; lineWidths: number[] } {
    const lineCount = this.opentui.symbols.textBufferGetLineCount(buffer)
    if (lineCount === 0) {
      return { lineStarts: [], lineWidths: [] }
    }

    const lineStartsPtr = this.opentui.symbols.textBufferGetLineStartsPtr(buffer)
    const lineWidthsPtr = this.opentui.symbols.textBufferGetLineWidthsPtr(buffer)

    if (!lineStartsPtr || !lineWidthsPtr) {
      return { lineStarts: [], lineWidths: [] }
    }

    const lineStartsArray = new Uint32Array(toArrayBuffer(lineStartsPtr, 0, lineCount * 4))
    const lineWidthsArray = new Uint32Array(toArrayBuffer(lineWidthsPtr, 0, lineCount * 4))

    const lineStarts = Array.from(lineStartsArray)
    const lineWidths = Array.from(lineWidthsArray)

    return { lineStarts, lineWidths }
  }

  public getTextBufferArrays(
    buffer: Pointer,
    size: number,
  ): {
    char: Uint32Array
    fg: Float32Array
    bg: Float32Array
    attributes: Uint16Array
  } {
    return this.getTextBuffer(buffer, size)
  }

  public bufferDrawTextBuffer(
    buffer: Pointer,
    textBuffer: Pointer,
    x: number,
    y: number,
    clipRect?: { x: number; y: number; width: number; height: number },
  ): void {
    const hasClipRect = clipRect !== undefined && clipRect !== null
    const clipX = clipRect?.x ?? 0
    const clipY = clipRect?.y ?? 0
    const clipWidth = clipRect?.width ?? 0
    const clipHeight = clipRect?.height ?? 0

    this.opentui.symbols.bufferDrawTextBuffer(
      buffer,
      textBuffer,
      x,
      y,
      clipX,
      clipY,
      clipWidth,
      clipHeight,
      hasClipRect,
    )
  }
}

let nativeLib: RenderLib | undefined

export function resolveRenderLib(): RenderLib {
  if (!nativeLib) {
    nativeLib = new FFIRenderLib()
  }
  return nativeLib
}
