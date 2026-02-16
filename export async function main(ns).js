/** @param {NS} ns */
export async function main(ns) {

	const ram = 262144;
	const threads = 130000;
// bellow is a l(L) not a 1
	let l = 0;

	var gtimes = 9;
	var htimes = 2;
	var wtimes = 4;

	const target = "joesguns";


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
		for(var i = 0; i < gtimes; i++){
		if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ram)) {

        	let hostname = ns.purchaseServer("Gserv" + l, ram);
			ns.scp("grow.js", hostname);
        	ns.exec("grow.js", hostname, threads);
        	++l;

    	}
	}

	for(var i = 0; i < htimes; i++){
		if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ram)) {

        	let hostname = ns.purchaseServer("Hserv" + l, ram);
			ns.scp("hack.js", hostname);
        	ns.exec("hack.js", hostname, threads);
        	++l;

    	}
	}

	for(var i = 0; i < wtimes; i++){
		if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ram)) {

        	let hostname = ns.purchaseServer("Wserv" + l, ram);
			ns.scp("weaken.js", hostname);
        	ns.exec("weaken.js", hostname, threads);
        	++l;

    	}

	}

	await ns.sleep(1000)
}



}


	

	