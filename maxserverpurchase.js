/** @param {NS} ns */
export async function main(ns) {
    const maxRam = ns.getPurchasedServerMaxRam();
    const maxServers = ns.getPurchasedServerLimit();
    const target = "joesguns";
    
    const growServers = 9;
    const hackServers = 8;
    const weakenServers = 8;
    
    let serversCreated = 0;
    
    // Nuke the target first
    if (ns.fileExists("BruteSSH.exe", "home")) {
        ns.brutessh(target);
    }
    if (ns.fileExists("FTPCrack.exe", "home")) {
        ns.ftpcrack(target);
    }
    if (ns.fileExists("relaySMTP.exe", "home")) {
        ns.relaysmtp(target);
    }
    if (ns.fileExists("HTTPWorm.exe", "home")) {
        ns.httpworm(target);
    }
    if (ns.fileExists("SQLInject.exe", "home")) {
        ns.sqlinject(target);
    }
    ns.nuke(target);
    
    ns.tprint("Starting server purchase and deployment...");
    
    // Purchase and setup GROW servers
    for (let i = 0; i < growServers; i++) {
        while (ns.getServerMoneyAvailable("home") < ns.getPurchasedServerCost(maxRam)) {
            await ns.sleep(5000);
        }
        
        let hostname = ns.purchaseServer(`Grow-${i}`, maxRam);
        ns.scp("grow.js", hostname);
        ns.exec("grow.js", hostname, 1, target);
        serversCreated++;
        ns.tprint(`Created ${hostname} running grow.js`);
    }
    
    // Purchase and setup HACK servers
    for (let i = 0; i < hackServers; i++) {
        while (ns.getServerMoneyAvailable("home") < ns.getPurchasedServerCost(maxRam)) {
            await ns.sleep(5000);
        }
        
        let hostname = ns.purchaseServer(`Hack-${i}`, maxRam);
        ns.scp("hack.js", hostname);
        ns.exec("hack.js", hostname, 1, target);
        serversCreated++;
        ns.tprint(`Created ${hostname} running hack.js`);
    }
    
    // Purchase and setup WEAKEN servers
    for (let i = 0; i < weakenServers; i++) {
        while (ns.getServerMoneyAvailable("home") < ns.getPurchasedServerCost(maxRam)) {
            await ns.sleep(5000);
        }
        
        let hostname = ns.purchaseServer(`Weaken-${i}`, maxRam);
        ns.scp("weaken.js", hostname);
        ns.exec("weaken.js", hostname, 1, target);
        serversCreated++;
        ns.tprint(`Created ${hostname} running weaken.js`);
    }
    
    ns.tprint("COMPLETE");
    ns.tprint(`${serversCreated}/${maxServers} servers deployed`);
}
