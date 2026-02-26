/** @param {NS} ns */
export async function main(ns) {
  while (true) {
    //Variable and Set Initialization

    const startingServer = "home";
    const serverList = new Set();
    const serverQueue = new Set();
    const scannedServers = new Set();

    //Server list initialization

    const initialScan = ns.scan(startingServer);

    initialScan.forEach((server) => {
      serverQueue.add(server);
    });

    while (serverQueue.size > 0) {
      serverQueue.forEach((server) => {

        if (serverList.has(server)) {
          serverQueue.delete(server)
        }

        else {
          serverList.add(server)
          if (!scannedServers.has(server)) {

            ns.scan(server).forEach((scanResult) => {

              serverQueue.add(scanResult)
            })
            scannedServers.add(server)
          }

          serverQueue.delete(server)
        }
      })
    }

    //Server Reference List filtering of Home Server

    const serverReference = new Set();


    serverList.forEach((server) => {
      if (server !== "home") {
        serverReference.add(server)
      }

    })


    //Server Initialization Complete

    //File Database initialization - TODO: Implement a loop to both add AND remove files from the database dynamically.

    const fileDatabase = new Set()

    const fileScan = ns.ls("home")

    fileScan.forEach((file) => {
      if (file.endsWith("exe")) {
        fileDatabase.add(file)
      }
    })


    //Initialization and execution of Port Opening and Nuke.exe


    //Prepare list of Server targets, excluding any that have already been opened by Nuke.exe 
    //and mapping them to their security level


    const serverTarget = new Set()
    const serverLvlMap = new Map();

    serverReference.forEach((server) => {
      const rootAccess = ns.getServer(server).hasAdminRights
      if (!rootAccess) {
        serverTarget.add(server)
        const requiredLevel = ns.getServerRequiredHackingLevel(server);
        const sshPortOpen = ns.getServer(server).sshPortOpen
        const ftpPortOpen = ns.getServer(server).ftpPortOpen
        const smtpPortOpen = ns.getServer(server).smtpPortOpen
        const httpPortOpen = ns.getServer(server).httpPortOpen
        const sqlPortOpen = ns.getServer(server).sqlPortOpen
        const openPorts = ns.getServer(server).openPortCount
        const portsReq = ns.getServer(server).numOpenPortsRequired

        serverLvlMap.set(server, {
          requiredLevel: requiredLevel,
          rootAccess: rootAccess,
          openPorts: openPorts,
          portsReq: portsReq,
          sshPortOpen: sshPortOpen,
          ftpPortOpen: ftpPortOpen,
          smtpPortOpen: smtpPortOpen,
          httpPortOpen: httpPortOpen,
          sqlPortOpen: sqlPortOpen
        });
      }
    })

    const filedatabase = [...fileDatabase]

    //Sequence of port opening and Nuke.exe

    const playerLvl = ns.getHackingLevel()

    serverLvlMap.forEach((serverData, server) => {
      if (serverData.openPorts < serverData.portsReq) {
        if (fileDatabase.has("BruteSSH.exe") && !serverData.sshPortOpen) {
          ns.brutessh(server);
        }
        if (fileDatabase.has("FTPCrack.exe") && !serverData.ftpPortOpen) {
          ns.ftpcrack(server);
        }
        if (fileDatabase.has("RelaySMTP.exe") && !serverData.smtpPortOpen) {
          ns.relaysmtp(server);
        }
        if (fileDatabase.has("HTTPWorm.exe") && !serverData.httpPortOpen) {
          ns.httpworm(server);
        }
        if (fileDatabase.has("SQLInject.exe") && !serverData.sqlPortOpen) {
          ns.sqlinject(server);
        }
      }
    })

    serverLvlMap.forEach((serverData, server) => {
      if (!serverData.rootAccess) {
        if (serverData.openPorts >= serverData.portsReq && playerLvl >= serverData.requiredLevel) {
          ns.nuke(server)
        }
      }
    })


    //End algorithm for Port opening and Nuke.exe
    // Begin system reinitialization
    serverList.clear()
    serverLvlMap.clear()
    serverQueue.clear()
    serverReference.clear()
    serverTarget.clear()
    fileDatabase.clear()

    //Prep for new cycle 

    await ns.sleep(30000)

    //Insert Logic for any operation below 
  }
} 
