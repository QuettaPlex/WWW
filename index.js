const express = require("express");
const named = require("node-named");
require("dotenv").config();

const app = express();
const dnsServer = named.createServer();
const port = process.env.PORT || 3000;
const dnsPort = process.env.DNS_PORT || 53;

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

dnsServer.listen(dnsPort, "127.0.0.1", function () {
    console.log("DNS server started on port "+ dnsPort);
});

dnsServer.on("query", function (query) {
    var domain = query.name();
    console.log("DNS Query: %s", domain);
    var target = named.ARecord("qhost.rnrr.one", "103.81.147.186", { ttl: 600 });
    query.addAnswer(domain, target, "A");
    dnsServer.send(query);
});