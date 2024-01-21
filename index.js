const express = require("express");
const dns = require("native-dns");
require("dotenv").config();

const app = express();
const dnsServer = dns.createServer();
const port = process.env.PORT || 3000;
const dnsPort = process.env.DNS_PORT || 53;

dnsServer.on("request", (request, response) => {
    console.log(request);
    response.additional.push(dns.A({
        name: "qhost.rnrr.one",
        address: "103.81.147.186",
        ttl: 600
    }));
    response.send();
});

dnsServer.on("error", (err) => {
    console.log(err.stack);
});

dnsServer.on("listening", () => {
    console.log("server listening on", this.address());
});

dnsServer.serve(dnsPort);

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});