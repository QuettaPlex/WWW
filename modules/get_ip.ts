import express from "express";

function getIP(request: express.Request): string {
    const ip = request.headers["cf-connecting-ip"]
        ? request.headers["cf-connecting-ip"]
        : request.headers["x-forwarded-for"]
            ? request.headers["x-forwarded-for"]
            : (request.connection && request.connection.remoteAddress)
                ? request.connection.remoteAddress
                : (request.socket && request.socket.remoteAddress)
                    ? request.socket.remoteAddress
                    : "0.0.0.0";
    return Array.isArray(ip) ? ip[0] : ip;
}

export default getIP;
