/** @param {NS} ns */
export async function main(ns) {
    const maxRam = ns.getPurchasedServerMaxRam(); // Get max RAM available
    const maxServers = ns.getPurchasedServerLimit(); // Usually 25
    const target = "joesguns"; // Target server to attack
    
    // Distribution of servers: 9 grow, 8 hack, 8 weaken (total 25)
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
    ns.tprint(`Max RAM per server: ${maxRam}GB`);
    ns.tprint(`Max servers: ${maxServers}`);
    
    // Purchase and setup GROW servers
    for (let i = 0; i < growServers; i++) {
        while (ns.getServerMoneyAvailable("home") < ns.getPurchasedServerCost(maxRam)) {
            ns.print("Waiting for money to buy grow server...");
            await ns.sleep(5000);
        }
        
        let hostname = ns.purchaseServer(`Grow-${i}`, maxRam);
        if (hostname) {
            ns.scp("grow.js", hostname);
            const threads = Math.floor(maxRam / ns.getScriptRam("grow.js"));
            ns.exec("grow.js", hostname, threads, target);
            serversCreated++;
            ns.tprint(`Created ${hostname} with ${threads} threads running grow.js`);
        }
    }
    
    // Purchase and setup HACK servers
    for (let i = 0; i < hackServers; i++) {
        while (ns.getServerMoneyAvailable("home") < ns.getPurchasedServerCost(maxRam)) {
            ns.print("Waiting for money to buy hack server...");
            await ns.sleep(5000);
        }
        
        let hostname = ns.purchaseServer(`Hack-${i}`, maxRam);
        if (hostname) {
            ns.scp("hack.js", hostname);
            const threads = Math.floor(maxRam / ns.getScriptRam("hack.js"));
            ns.exec("hack.js", hostname, threads, target);
            serversCreated++;
            ns.tprint(`Created ${hostname} with ${threads} threads running hack.js`);
        }
    }
    
    // Purchase and setup WEAKEN servers
    for (let i = 0; i < weakenServers; i++) {
        while (ns.getServerMoneyAvailable("home") < ns.getPurchasedServerCost(maxRam)) {
            ns.print("Waiting for money to buy weaken server...");
            await ns.sleep(5000);
        }
        
        let hostname = ns.purchaseServer(`Weaken-${i}`, maxRam);
        if (hostname) {
            ns.scp("weaken.js", hostname);
            const threads = Math.floor(maxRam / ns.getScriptRam("weaken.js"));
            ns.exec("weaken.js", hostname, threads, target);
            serversCreated++;
            ns.tprint(`Created ${hostname} with ${threads} threads running weaken.js`);
        }
    }
    
    ns.tprint("COMPLETE");
    ns.tprint(`${serversCreated}/${maxServers} servers deployed`);
    ns.tprint(`9 Grow servers | 8 Hack servers | 8 Weaken servers`);
    ns.tprint(`All targeting: ${target}`);
}
