export async function main(ns) {

	// good targets megacorp, ecorp, kuai-gong, 4sigma
	
    const target = "joesguns";

	const stats = ns.getServer(target)

	if (ns.fileExists("BruteSSH.exe", "home")) {
        ns.brutessh(target);
	}
	if (ns.fileExists("ftpcrack.exe", "home")) {
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

    // Infinite loop that continously hacks/grows/weakens the target server
    while(true) {
		await ns.weaken(target);
		await ns.grow(target);
		await ns.hack(target);
            
        }
            
        
}