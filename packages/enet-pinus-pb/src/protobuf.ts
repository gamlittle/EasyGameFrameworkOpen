import { ByteArray, Endian } from "./ByteArray";

export class Protobuf {
    static TYPES: any = {
        uInt32: 0,
        sInt32: 0,
        int32: 0,
        double: 1,
        string: 2,
        message: 2,
        float: 5,
        bool: 0
    };
    private static _clients: any = {};
    private static _servers: any = {};

    static init(protos: any): void {
        Protobuf._clients = (protos && protos.client) || {};
        Protobuf._servers = (protos && protos.server) || {};
    }

    static encode(route: string, msg: any): ByteArray {
        let protos: any = Protobuf._clients[route];

        if (!protos) return null;

        return Protobuf.encodeProtos(protos, msg);
    }

    static decode(route: string, buffer: ByteArray): any {
        let protos: any = Protobuf._servers[route];

        if (!protos) return null;

        return Protobuf.decodeProtos(protos, buffer);
    }
    private static encodeProtos(protos: any, msg: any): ByteArray {
        let buffer: ByteArray = new ByteArray();

        for (let name in msg) {
            if (protos[name]) {
                let proto: any = protos[name];

                switch (proto.option) {
                    case "optional":
                    case "required":
                        buffer.writeBytes(Protobuf.encodeTag(proto.type, proto.tag));
                        Protobuf.encodeProp(msg[name], proto.type, protos, buffer);
                        break;
                    case "repeated":
                        if (!!msg[name] && msg[name].length > 0) {
                            Protobuf.encodeArray(msg[name], proto, protos, buffer);
                        }
                        break;
                }
            }
        }

        return buffer;
    }
    static decodeProtos(protos: any, buffer: ByteArray): any {
        let msg: any = {};

        while (buffer.bytesAvailable) {
            let head: any = Protobuf.getHead(buffer);
            let name: string = protos.__tags[head.tag];

            switch (protos[name].option) {
                case "optional":
                case "required":
                    msg[name] = Protobuf.decodeProp(protos[name].type, protos, buffer);
                    break;
                case "repeated":
                    if (!msg[name]) {
                        msg[name] = [];
                    }
                    Protobuf.decodeArray(msg[name], protos[name].type, protos, buffer);
                    break;
            }
        }

        return msg;
    }

    static encodeTag(type: number, tag: number): ByteArray {
        let value: number = Protobuf.TYPES[type] !== undefined ? Protobuf.TYPES[type] : 2;

        return Protobuf.encodeUInt32((tag << 3) | value);
    }
    static getHead(buffer: ByteArray): any {
        let tag: number = Protobuf.decodeUInt32(buffer);

        return { type: tag & 0x7, tag: tag >> 3 };
    }
    static encodeProp(value: any, type: string, protos: any, buffer: ByteArray): void {
        switch (type) {
            case "uInt32":
                buffer.writeBytes(Protobuf.encodeUInt32(value));
                break;
            case "int32":
            case "sInt32":
                buffer.writeBytes(Protobuf.encodeSInt32(value));
                break;
            case "float":
                // Float32Array
                let floats: ByteArray = new ByteArray();
                floats.endian = Endian.LITTLE_ENDIAN;
                floats.writeFloat(value);
                buffer.writeBytes(floats);
                break;
            case "double":
                let doubles: ByteArray = new ByteArray();
                doubles.endian = Endian.LITTLE_ENDIAN;
                doubles.writeDouble(value);
                buffer.writeBytes(doubles);
                break;
            case "string":
                //Encode length
                const valueByteLen = Protobuf.byteLength(value);
                //Write String
                buffer.writeBytes(Protobuf.encodeProtobuf(valueByteLen));
                buffer.writeUTFBytes(value);
                break;
            case 'bool':
                const intValue = value ? 1 : 0;
                buffer.writeBytes(Protobuf.encodeUInt32(intValue));
                break;
            default:
                let proto: any = protos.__messages[type] || Protobuf._clients["message " + type];
                if (!!proto) {
                    let buf: ByteArray = Protobuf.encodeProtos(proto, value);
                    buffer.writeBytes(Protobuf.encodeUInt32(buf.length));
                    buffer.writeBytes(buf);
                }
                break;
        }
    }

    static decodeProp(type: string, protos: any, buffer: ByteArray): any {
        switch (type) {
            case "uInt32":
                return Protobuf.decodeUInt32(buffer);
            case "int32":
            case "sInt32":
                return Protobuf.decodeSInt32(buffer);
            case "float":
                let floats: ByteArray = new ByteArray();
                buffer.readBytes(floats, 0, 4);
                floats.endian = Endian.LITTLE_ENDIAN;
                let float: number = buffer.readFloat();
                return floats.readFloat();
            case "double":
                let doubles: ByteArray = new ByteArray();
                buffer.readBytes(doubles, 0, 8);
                doubles.endian = Endian.LITTLE_ENDIAN;
                return doubles.readDouble();
            case "string":
                let length: number = Protobuf.decodeUInt32(buffer);
                return buffer.readUTFBytes(length);
            case 'bool':
                const value = Protobuf.decodeUInt32(buffer);
                const boolValue = value ? true : false;
                return boolValue;
            default:
                let proto: any = protos && (protos.__messages[type] || Protobuf._servers["message " + type]);
                if (proto) {
                    let len: number = Protobuf.decodeUInt32(buffer);
                    let buf: ByteArray;
                    if (len) {
                        buf = new ByteArray();
                        buffer.readBytes(buf, 0, len);
                    }

                    return len ? Protobuf.decodeProtos(proto, buf) : false;
                }
                break;
        }
    }

    static isSimpleType(type: string): boolean {
        return (
            type === "uInt32" ||
            type === "sInt32" ||
            type === "int32" ||
            type === "uInt64" ||
            type === "sInt64" ||
            type === "float" ||
            type === "double" ||
            type === "bool"
        );
    }
    static encodeArray(array: Array<any>, proto: any, protos: any, buffer: ByteArray): void {
        let isSimpleType = Protobuf.isSimpleType;
        if (isSimpleType(proto.type)) {
            buffer.writeBytes(Protobuf.encodeTag(proto.type, proto.tag));
            buffer.writeBytes(Protobuf.encodeUInt32(array.length));
            let encodeProp = Protobuf.encodeProp;
            for (let i: number = 0; i < array.length; i++) {
                encodeProp(array[i], proto.type, protos, buffer);
            }
        } else {
            let encodeTag = Protobuf.encodeTag;
            for (let j: number = 0; j < array.length; j++) {
                buffer.writeBytes(encodeTag(proto.type, proto.tag));
                Protobuf.encodeProp(array[j], proto.type, protos, buffer);
            }
        }
    }
    static decodeArray(array: Array<any>, type: string, protos: any, buffer: ByteArray): void {
        let isSimpleType = Protobuf.isSimpleType;
        let decodeProp = Protobuf.decodeProp;

        if (isSimpleType(type)) {
            let length: number = Protobuf.decodeUInt32(buffer);
            for (let i: number = 0; i < length; i++) {
                array.push(decodeProp(type, protos, buffer));
            }
        } else {
            array.push(decodeProp(type, protos, buffer));
        }
    }

    static encodeUInt32(n: number): ByteArray {
        let result: ByteArray = new ByteArray();

        do {
            let tmp: number = n % 128;
            let next: number = Math.floor(n / 128);

            if (next !== 0) {
                tmp = tmp + 128;
            }

            result.writeByte(tmp);
            n = next;
        } while (n !== 0);

        return result;
    }
    static decodeUInt32(buffer: ByteArray): number {
        let n: number = 0;

        for (let i: number = 0; i < buffer.length; i++) {
            let m: number = buffer.readUnsignedByte();
            n = n + (m & 0x7f) * Math.pow(2, 7 * i);
            if (m < 128) {
                return n;
            }
        }
        return n;
    }
    static encodeSInt32(n: number): ByteArray {
        n = n < 0 ? Math.abs(n) * 2 - 1 : n * 2;

        return Protobuf.encodeUInt32(n);
    }
    static decodeSInt32(buffer: ByteArray): number {
        let n: number = Protobuf.decodeUInt32(buffer);

        let flag: number = n % 2 === 1 ? -1 : 1;

        n = (((n % 2) + n) / 2) * flag;

        return n;
    }
    static byteLength(str) {
        if (typeof str !== "string") {
            return -1;
        }

        var length = 0;

        for (var i = 0; i < str.length; i++) {
            var code = str.charCodeAt(i);
            length += Protobuf.codeLength(code);
        }

        return length;
    }
    static codeLength(code) {
        if (code <= 0x7f) {
            return 1;
        } else if (code <= 0x7ff) {
            return 2;
        } else {
            return 3;
        }
    }
}
