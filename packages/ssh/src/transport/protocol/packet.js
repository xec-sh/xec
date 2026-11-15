// The current transport negotiates uncompressed packets only. Compression is
// deliberately absent rather than routed through runtime-private zlib bindings.
export class PacketReader {
  cleanup() {}
  read(data) {
    return data;
  }
}
export class PacketWriter {
  constructor(protocol) {
    this.allocStart = 5;
    this.allocStartKEX = 5;
    this._protocol = protocol;
  }
  cleanup() {}
  alloc(payloadSize, handshake) {
    if (this._protocol._kexinit === undefined || handshake) return this._protocol._cipher.allocPacket(payloadSize);
    return Buffer.allocUnsafe(payloadSize);
  }
  finalize(packet) {
    return packet;
  }
}
