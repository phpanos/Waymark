export type Motion = 'forward' | 'follow' | 'across' | 'back' | 'inward' | 'loop' | 'left-wall' | 'right-wall'
  | 'screen-up' | 'screen-left' | 'screen-right' | 'screen-upper-right'

type Leg = readonly [motion: Motion, instruction: string, destination: string]
export type DirectionGuide = {
  origin: string
  legs: readonly Leg[]
  layout?: 'worldMap' | 'landmarks'
  quickSteps?: readonly string[]
  returnSteps?: { heading: string; steps: readonly string[] }
}

const islandReturnLegs = [
  ["forward", "Loot the fragment if present. Check Matiki’s cage and finish dialogue.", "Island boss rewards"],
  ["back", "Use Return to Ship when offered. Freed Matiki? Check for Eye of Hinekora.", "Ship"],
] as const satisfies readonly Leg[]

// Screen arrows refer to the game map. Other arrows are relative to the named starting point.
export const directionsByArea: Readonly<Partial<Record<string, DirectionGuide>>> = {
  G1_1: { origin: "Starting shore", quickSteps: [
    "Follow the path inland.",
    "Defeat the Bloated Miller.",
    "Enter Clearfell Encampment.",
  ], legs: [
    ["forward", "Follow the path inland", "The Bloated Miller"],
    ["forward", "Continue past the arena", "Clearfell Encampment"],
  ] },
  G1_town: { origin: "Clearfell Encampment", quickSteps: ["Exit to Clearfell."], legs: [
    ["follow", "Exit to", "Clearfell"],
  ] },
  G1_2: { origin: "Clearfell on the world map", layout: "worldMap", quickSteps: [
    "Skip Mud Burrow. Head to the Grelwood.",
    "Hug the edge toward the Grelwood icon on the world map.",
  ], legs: [
    ["screen-up", "If the Grelwood icon is above", "Search the top edge"],
    ["screen-left", "If the icon is to the left", "Search the left edge"],
    ["screen-right", "If the icon is to the right", "Search the right edge"],
  ] },
  G1_3: { origin: "Mud Burrow entrance", legs: [
    ["left-wall", "Try the left wall for the Devourer.", "Devourer’s nest"],
  ] },
  G1_4: { origin: "Grelwood landmarks", layout: "landmarks", quickSteps: [
    "Follow glowing roots. Activate the tree waypoint.",
    "Tag the Grim Tangle waypoint if you find it early.",
    "Follow the river to the Red Vale.",
    "Red Vale first? Tag its waypoint, then find the tree waypoint.",
  ], returnSteps: {
    heading: "After the Red Vale",
    steps: [
      "Waypoint to the tree. Place Renly’s Runed Spikes.",
      "Portal to Una. Return via the Grim Tangle waypoint or follow orange mushrooms.",
    ],
  }, legs: [
    ["follow", "Follow the glowing roots and activate the nearby waypoint", "Tree of Souls"],
    ["follow", "The main landmarks form a rough diamond. Use the world map to pick a side and follow the river", "The Red Vale"],
    ["follow", "Follow the orange mushrooms after freeing the Hooded One and reporting to Una", "The Grim Tangle"],
  ] },
  G1_5: { origin: "Rust obelisks", quickSteps: [
    "Sweep the wall for obelisks. Found one off a short spur? Check the central island.",
    "Kill the Rust King. Take the final girdle.",
    "Portal to Renly for the Runed Spikes.",
    "Waypoint back to the Grelwood tree.",
  ], legs: [
    ["loop", "Sweep the outer wall and check small side paths", "Rust obelisks"],
    ["inward", "If a small side path leads straight to an obelisk, look on the central island for all three", "Central island layout"],
  ] },
  G1_6: { origin: "Root barrier", legs: [
    ["forward", "Pass as soon as Una opens the roots.", "Main path"],
    ["follow", "Head away from the entrance. Backtrack at dead ends.", "Cemetery of the Eternals"],
  ] },
  G1_7: { origin: "Cemetery entrance", legs: [
    ["loop", "Sweep the edges for both tombs. Check the middle if needed.", "The two tomb doors"],
    ["follow", "Tag both tomb checkpoints. Clear either tomb first.", "Draven and Asinia"],
    ["back", "Bring both keys to Lachlann at the Memorial Gate.", "Memorial Gate"],
  ] },
  G1_8: { origin: "Mausoleum entrance", legs: [
    ["across", "Cross the wheel tile. Check the far corner.", "Draven"],
    ["follow", "If empty, follow the short wall to its other corner.", "Ribbed arena edge"],
  ] },
  G1_9: { origin: "Tomb entrance", legs: [
    ["follow", "Check both branches for Asinia and the support gem encounter.", "Asinia"],
  ] },
  G1_11: { origin: "Hunting Grounds entrance", legs: [
    ["loop", "Hug either wall for the exit and optional encounters.", "Signpost"],
    ["follow", "Follow the signpost to the Farmlands.", "Ogham Farmlands"],
    ["back", "Farmlands first? Tag its waypoint, then return for Crowbell or Freythorn.", "Hunting Grounds"],
  ] },
  G1_12: { origin: "Ritual sites", legs: [
    ["follow", "Follow the locusts after each ritual", "Next altar"],
    ["forward", "After 3 rituals, use the arena altar.", "King in the Mists"],
    ["forward", "After the King, portal to town. Waypoint to the Farmlands if tagged.", "Ogham Farmlands"],
  ] },
  G1_13_1: { origin: "Farmlands entrance", legs: [
    ["follow", "Follow the road to the wagon barricade.", "Wagon barricade"],
    ["follow", "Go around the wagons. Follow the road toward the village.", "Ogham Village"],
    ["back", "Turn in Una’s lute on your next town trip.", "Clearfell Encampment"],
  ] },
  G1_13_2: { origin: "Village entrance", legs: [
    ["follow", "Follow the road to the blacksmith's tools", "Blacksmithing area"],
    ["back", "Found Renly’s tools? Portal for the salvage unlock. Turn in the lute if held.", "Clearfell Encampment"],
    ["follow", "Return through your portal. Use the world map for the exit side.", "The Executioner"],
  ] },
  G1_14: { origin: "Ramparts entrance", legs: [
    ["follow", "Hug a wall around the bend. Reverse at dead ends.", "Ogham Manor"],
  ] },
  G1_15: { origin: "Manor entrance", legs: [
    ["follow", "Floor 1: Check both sides of the bridge. Read the Psalm of Madness for Candlemass.", "Grotesque Altar"],
    ["back", "Stairs first? Tag the checkpoint. Use it after Candlemass.", "Floor one stairs"],
    ["across", "Floor 2: Head opposite floor 1.", "Next staircase"],
    ["follow", "Top floor: Find the single hallway. Approach from southeast.", "Count Geonor"],
  ] },
  G2_1: { origin: "Outskirts entrance", legs: [
    ["follow", "Follow the outer wall in the direction the path bends.", "Narrow canyon"],
    ["forward", "Look for tall rock spikes near Rathbreaker.", "Rathbreaker"],
    ["back", "After Rathbreaker, portal to Zarka.", "Ardura Caravan"],
  ] },
  G2_2: { origin: "Passage entrance", legs: [
    ["forward", "Look for the curved Six Sisters bridge", "Six Sisters"],
    ["follow", "Hug a wall away from the entrance toward Halani Gates.", "The Halani Gates"],
  ] },
  G2_3: { origin: "Locked gates", legs: [
    ["forward", "Go through the openings Asala clears", "Bridges"],
    ["follow", "Asala lagging? Tag gate 2’s checkpoint. Respawn there if available.", "Second gate"],
    ["follow", "Cross the bridges to Jamanra.", "Jamanra"],
    ["forward", "After Jamanra retreats, take the stairs to the sandstorm before portaling.", "Sandstorm barrier"],
  ] },
  G2_3s: { origin: "Sandstorm barrier", legs: [
    ["back", "At the sandstorm, wait for the quest update. Portal to Zarka and Asala.", "Ardura Caravan"],
    ["forward", "Trial on the Desert Map? Tag its waypoint for later.", "Trial of the Sekhemas"],
  ] },
  G2_4_1: { origin: "Keth entrance", legs: [
    ["forward", "Keep the entrance heading. Look for red paving.", "The Lost City"],
    ["follow", "Tag the Lost City entrance checkpoint.", "Lost City entrance"],
  ] },
  G2_4_2: { origin: "Lost City entrance", quickSteps: [
    "Check both ends of the far wall for the bridge.",
    "Cross, then hug the outer wall to the Buried Shrines.",
  ], legs: [
    ["forward", "Go straight to the far wall and try either end. If it dead-ends, check the other end", "V-shaped bridge"],
    ["across", "Cross the bridge", "Second section"],
    ["follow", "Sweep the far wall for a wing-shaped approach", "Buried Shrines"],
  ] },
  G2_4_3: { origin: "Shrine entrance", legs: [
    ["follow", "Look for a right-angle corridor. Swap sides at the map edge.", "Bridges"],
    ["across", "Cross a bridge and follow the outer wall", "Crown-shaped area"],
    ["forward", "Enter the crown-shaped approach", "Azarian"],
    ["back", "After Azarian, take the Essence of Water. Portal to Zarka.", "Ardura Caravan"],
  ] },
  G2_5_1: { origin: "Badlands entrance", legs: [
    ["follow", "Hug either wall to the Bone Pits.", "The Bone Pits"],
  ] },
  G2_5_2: { origin: "Starting bone arch", legs: [
    ["forward", "Keep the heading you took through the arch", "Far wall"],
    ["follow", "Search along that wall for the arena", "Iktab and Ekbab"],
    ["back", "Take the Mastodon Tusks after both bosses. Portal to Zarka.", "Ardura Caravan"],
  ] },
  G2_6: { origin: "Sealed grotto entrance", legs: [
    ["forward", "Tag the sealed Grotto door checkpoint first.", "Sealed Grotto door"],
    ["loop", "Take each gorge path and activate its seal.", "Three Ancient Seals"],
    ["back", "After seal 3, checkpoint back to the Grotto door.", "The Titan Grotto"],
  ] },
  G2_7: { origin: "Starting corridor", legs: [
    ["follow", "Hug a wall to the long stair bridge.", "Zalmarath"],
    ["back", "After Zalmarath, take the Flame Ruby. Portal to Zarka.", "Ardura Caravan"],
  ] },
  G2_8: { origin: "Deshar entrance", legs: [
    ["follow", "Take either branch. Turn inward where they rejoin.", "Open ruins"],
    ["follow", "Look for lit lanterns beside the exit", "Path of Mourning"],
  ] },
  G2_9_1: { origin: "Round platforms", legs: [
    ["across", "Take bridges that lead away from the entrance", "Far edge"],
    ["follow", "Look along the opposite edge", "The Spires of Deshar"],
  ] },
  G2_9_2: { origin: "Spires entrance", legs: [
    ["across", "Cross the connected platforms away from the entrance", "Tor Gul"],
    ["follow", "Claim Garukhan’s reward or tag its checkpoint for after Tor Gul.", "Sisters of Garukhan"],
    ["back", "After Tor Gul, portal to Asala. Give Shambrin the Final Letter if found.", "Ardura Caravan"],
  ] },
  G2_10_1: { origin: "Quarry entrance", legs: [
    ["across", "Cross open areas diagonally after each bridge", "Far side"],
    ["forward", "Look for a checkpoint to confirm the way out", "Mawdun Mine"],
  ] },
  G2_10_2: { origin: "Mine entrance", legs: [
    ["left-wall", "At checkpoint 1, try the left wall. Follow the rails.", "Far side"],
    ["follow", "Look for a circular approach with debris on the ground", "Rudja's arena"],
    ["back", "After Rudja, free and speak to Risu. Portal to Risu and Asala.", "Ardura Caravan"],
  ] },
  G2_11: { origin: "First deck", legs: [
    ["across", "Keep taking gangways that lead farther along the convoy", "Dreadnought"],
  ] },
  G2_12: { origin: "Dreadnought", legs: [
    ["back", "After Jamanra, portal to the Hooded One and Asala.", "Ardura Caravan"],
  ] },
  G2_13: { origin: "Trial entrance", legs: [
    ["follow", "Tag the entrance waypoint if saving the trial for later.", "Trial of the Sekhemas waypoint"],
  ] },
  G3_1: { origin: "Starting waypoint", legs: [
    ["forward", "Cross the bridges away from the entrance.", "Far side of the marsh"],
    ["follow", "Check the far corners for the exit", "Ziggurat Encampment"],
  ] },
  G3_3: { origin: "Jungle Ruins entrance", legs: [
    ["follow", "Hug a wall. Use the camp to orient toward the exit.", "Infested Barrens"],
    ["follow", "Tag the Jungle Ruins waypoint before the Crypts.", "Venom Crypts entrance"],
  ] },
  G3_4: { origin: "Crypt entrance", legs: [
    ["follow", "Hug a wall. Check side chambers for the Priestess.", "Serpent Priestess corpse"],
    ["back", "Take the venom. Portal to Servi now or use the nearer exit.", "Jungle Ruins or Ziggurat Encampment"],
  ] },
  G3_2_1: { origin: "Alva and the waypoint", legs: [
    ["follow", "Tag Alva’s waypoint before the Wetlands.", "Infested Barrens waypoint"],
    ["forward", "Follow the entrance corridor’s heading to the far edge.", "Chimeral Wetlands"],
  ] },
  G3_2_2: { origin: "First canal", quickSteps: [
    "Step on each pad to cross the canals.",
    "Take the Azak Bog side exit for Ignagduk. Tag its waypoint if deferring.",
    "Cross the drained stretch. On quest update, portal to Alva.",
  ], legs: [
    ["across", "Step on each pad to cross the canals.", "Main canal route"],
  ] },
  G3_5: { origin: "Wetlands entrance", legs: [
    ["follow", "Check the world map. Hug the Machinarium-side wall.", "Xyclucian and the Machinarium"],
    ["back", "Temple of Chaos first? Tag its waypoint, then return to the Wetlands.", "Temple of Chaos waypoint"],
  ] },
  G3_6_1: { origin: "Alva's altar", legs: [
    ["follow", "Check rooms beside Alva for the first core.", "Alva's altar"],
    ["forward", "Follow the road. Search side rooms for more cores.", "Jiquani's Sanctum"],
  ] },
  G3_6_2: { origin: "Two wings", legs: [
    ["follow", "Find a core and power a generator in each wing.", "Two powered generators"],
    ["back", "Power both generators. Checkpoint back to Zicoatl.", "Zicoatl"],
    ["back", "Take the Large Soul Core. Waypoint to Jungle Ruins and open the Waterways.", "Canal Mechanism"],
  ] },
  G3_7: { origin: "Bog entrance", legs: [
    ["follow", "Tag the Bog waypoint if saving Ignagduk for later.", "Azak Bog waypoint"],
    ["follow", "Hug either wall. Check inner forks if needed.", "Ignagduk"],
  ] },
  G3_8: { origin: "Drowned City entrance", legs: [
    ["forward", "Tag the Drowned City waypoint. Cross the ambush into the ruins.", "Apex of Filth"],
    ["follow", "Doing both branches? Tag the Vault and Apex waypoints as you find them.", "Branch waypoints"],
  ] },
  G3_9: { origin: "Vault entrance", legs: [
    ["follow", "Follow the vault path to the molten channel", "Mektul"],
    ["back", "Take the Hammer of Kamasa. Checkpoint to the entrance for Apex.", "Drowned City"],
    ["back", "Apex tagged? Portal to Oswald with the hammer, then waypoint to Apex.", "Apex of Filth"],
  ] },
  G3_11: { origin: "First open square", quickSteps: [
    "Find the narrow hourglass-shaped crossing.",
    "Sweep the far edge for the Queen’s Y-shaped approach.",
    "Take the idol. Checkpoint to Apex waypoint, then travel via Drowned City to Alva.",
  ], legs: [
    ["forward", "Leave the square through its open passage. If it exits sideways, turn back toward the entrance side", "Hourglass-shaped crossing"],
    ["across", "Cross the narrow middle and try either end of the far edge", "Y-shaped arena approach"],
    ["follow", "If the first end is empty, sweep across to the other end", "The Queen of Filth"],
  ] },
  G3_12: { origin: "Each triangular floor", legs: [
    ["loop", "Floor 1: Check the far corner, then the others.", "Next floor"],
    ["across", "If split by a rift, cross and check the far corners.", "Ketzuli"],
    ["back", "After Ketzuli, talk to Alva. Portal once the platform moves and the quest updates.", "Ziggurat Encampment"],
  ] },
  G3_14: { origin: "Utzaal entrance", legs: [
    ["follow", "Follow the road southeast, then northeast where it turns", "Viper's arena"],
    ["forward", "Keep going past the arena and look for stairs", "Aggorat"],
  ] },
  G3_16: { origin: "Chanting platform", legs: [
    ["across", "Cross the chanting platform and arch to the hourglass crossing.", "Main ruins"],
    ["follow", "Follow the open branch toward the long stairs", "The Black Chambers"],
  ] },
  G3_17: { origin: "First bridge", legs: [
    ["across", "Take either branch. Cross the bridges back toward the middle.", "Doryani"],
    ["back", "Loot after Doryani. Portal to the encampment for Doryani and Alva.", "Ziggurat Encampment"],
  ] },
  G4_town: { origin: "Kingsmarch", legs: [
    ["follow", "Go down to the docks and board the ship", "Makoru"],
  ] },
  G4_1_1: { origin: "Dock", legs: [
    ["forward", "Head inland in the direction the pier points", "Caged beasts"],
    ["follow", "If you pass the cages, keep the same heading to find the exit", "Volcanic Warrens"],
  ] },
  G4_1_2: { origin: "Warrens entrance", legs: [
    ["follow", "Hug either outer wall through the tunnels", "Krutog's throne"],
    ...islandReturnLegs,
  ] },
  G4_2_1: { origin: "Kedge Bay landing", legs: [
    ["follow", "Follow the main shoreline path", "Journey's End"],
  ] },
  G4_2_2: { origin: "Journey's End entrance", legs: [
    ["follow", "Tag the Journey's End waypoint before Hartlin.", "Journey's End waypoint"],
    ["follow", "Follow the coast toward the far side", "Wreck with the captain's chair"],
    ["back", "Take the ingots. Portal to Dannig for spikes, then waypoint to Freya.", "Freya's totems"],
    ["back", "After Omniphobia, return to Tujen for passive points.", "Tujen"],
  ] },
  G4_3_1: { origin: "Island landing", legs: [
    ["follow", "Pick either outer wall and keep following it for the cavern entrance", "Singing Caverns"],
  ] },
  G4_3_2: { origin: "Cavern entrance", legs: [
    ["loop", "Try the north or west side of the loop. Check both edges.", "Diamora"],
    ...islandReturnLegs,
  ] },
  G4_4_1: { origin: "Well and challenge rooms", legs: [
    ["forward", "Follow the path through three tests", "Fork"],
    ["follow", "After test 3, check the checkpoint branch for Silent Hall.", "Maximum mana reward"],
    ["follow", "Take the branch toward the halls", "Halls of the Dead"],
  ] },
  G4_4_2: { origin: "Halls entrance", legs: [
    ["follow", "Continue round the outer wall beyond the totems", "Yama"],
  ] },
  G4_4_3: { origin: "Entrance past Yama", legs: [
    ["forward", "Go through to the meeting area", "Navali and Hinekora"],
    ["back", "Claim Navali's reward. Then Return to Ship.", "Ship"],
  ] },
  G4_5_1: { origin: "Prison entrance", legs: [
    ["follow", "Hug a wall. Tag cell-block checkpoints and swap branches at dead ends.", "Solitary Confinement"],
    ["follow", "Use any Chapel Key and claim the flask bonus before leaving.", "Goddess of Justice"],
  ] },
  G4_5_2: { origin: "Solitary Confinement entrance", legs: [
    ["follow", "Follow the wall where waves break against it", "The Prisoner"],
    ...islandReturnLegs,
  ] },
  G4_7: { origin: "Shrike Island landing", legs: [
    ["loop", "Follow the outer spiral. Stay on the road past side caves.", "Scourge of the Skies"],
    ...islandReturnLegs,
  ] },
  G4_8b: { origin: "Arastas town edge", legs: [
    ["forward", "Keep the heading of the entrance path through the cave and town", "Cliffside checkpoint"],
    ["follow", "Tag the cliffside checkpoint. Check opposite branches for the bells.", "Morning and Evening Bells"],
    ["forward", "Return to the checkpoint. Follow the main path.", "Torvian and the Excavation"],
  ] },
  G4_10: { origin: "Excavation entrance", legs: [
    ["forward", "Activate the checkpoint in the connecting chamber", "Second set of rooms"],
    ["follow", "Hug either outer wall through the far rooms", "Benedictus"],
    ["forward", "After Benedictus, enter the forge. Finish Hooded One dialogue before portaling.", "Excavated Site"],
    ["back", "Portal to Kingsmarch. Sail with Rhodri.", "Rhodri"],
  ] },
  G4_11_1a: { origin: "Ngakanu settlement", legs: [
    ["follow", "Have the shark fin? Hand it to Kaimana in the settlement.", "Kaimana"],
  ] },
  G4_11_1b: { origin: "Ngakanu landing", legs: [
    ["forward", "Pass the checkpoint and go through the wooden gates", "Outer boundary"],
    ["follow", "Hug either wall to find the exit", "Heart of the Tribe"],
  ] },
  G4_11_2: { origin: "Landing", legs: [
    ["forward", "Pass checkpoint 1. At the next fork, avoid the side checkpoint.", "Tavakai"],
    ["back", "After Tavakai, finish the scene and talk to him. Return to the Hooded One.", "Kingsmarch"],
  ] },
  G4_13: { origin: "Dannig’s Expedition", legs: [
    ["forward", "Include the entrance in the explosion chain, then go through it", "Deserted Post"],
  ] },
}
