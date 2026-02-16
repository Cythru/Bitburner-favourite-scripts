/** @param {NS} ns */
export async function main(ns) {
	
	var ram = 110000;
	var ramN = ram / 55000
	var threads = ramN / 2
	var balance = ns.getServerMoneyAvailable("home");
	let l = 0;
	var gtimes = 15;
	var htimes = 2;
	var wtimes = 8;

const target = "n00dles";

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

	while(true){
		if (ram * 25 < balance){
		
			for(var i = 0; i < ram; i++){

				ram * 2
			if (ram > balance){
				ram / 2
				break;
			}
			}
		for(var gi = 0; gi < gtimes; gi++){
		if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ramN)) {

        	let hostname = ns.purchaseServer("Gserv" + l, ramN);
			ns.scp("grow.js", hostname);
        	ns.exec("grow.js", hostname, threads);
        	++l;
					
		for(var wi = 0; wi < wtimes; wi++){
		if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ramN)) {

        	let hostname = ns.purchaseServer("Wserv" + l, ramN);
			ns.scp("weaken.js", hostname);
        	ns.exec("weaken.js", hostname, threads);
        	++l;

    	}

	}

		for(var hi = 0; hi < htimes; hi++){
		if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ramN)) {

        	let hostname = ns.purchaseServer("Hserv" + l, ramN);
			ns.scp("hack.js", hostname);
        	ns.exec("hack.js", hostname, threads);
        	++l;
				}
			}
		}
		}
		}
	await ns.sleep(1000)
	}
}
