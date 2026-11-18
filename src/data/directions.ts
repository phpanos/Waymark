export type Motion = 'forward' | 'follow' | 'across' | 'back' | 'inward' | 'loop' | 'left-wall' | 'right-wall'
  | 'screen-up' | 'screen-left' | 'screen-right' | 'screen-upper-right'

type Leg = readonly [motion: Motion, instruction: string, destination: string]
export type DirectionGuide = {
  origin: string
  legs: readonly Leg[]
  layout?: 'worldMap' | 'landmarks'
}

// Screen arrows refer to the game map. Other arrows are relative to the named starting point.
export const directionsByArea: Readonly<Partial<Record<string, DirectionGuide>>> = {
  G1_1: { origin: "Starting shore", legs: [
    ["forward", "Follow the path inland", "The Bloated Miller"],
    ["forward", "Continue past the arena", "Clearfell Encampment"],
  ] },
  G1_town: { origin: "Clearfell Encampment", legs: [
    ["screen-right", "Head toward the east side of town and look for the exit marker", "Clearfell"],
  ] },
  G1_2: { origin: "Clearfell on the world map", layout: "worldMap", legs: [
    ["screen-up", "If the Grelwood icon is above", "Search the top edge"],
    ["screen-left", "If the icon is to the left", "Search the left edge"],
    ["screen-right", "If the icon is to the right", "Search the right edge"],
  ] },
  G1_3: { origin: "Mud Burrow entrance", legs: [
    ["left-wall", "Try following the left edge through the tunnels", "Devourer’s nest"],
  ] },
  G1_4: { origin: "Grelwood landmarks", layout: "landmarks", legs: [
    ["follow", "Follow the glowing roots", "Tree of Souls"],
    ["follow", "Follow the river", "The Red Vale"],
    ["follow", "Follow the orange mushrooms", "The Grim Tangle"],
  ] },
  G1_5: { origin: "Rust obelisks", legs: [
    ["loop", "Sweep around the zone", "Find three obelisks"],
    ["inward", "Check near the blood river if you missed one", "Final obelisk"],
  ] },
  G1_6: { origin: "Root barrier", legs: [
    ["forward", "Pass through after Una opens the roots", "Main path"],
    ["across", "Head away from the entrance to the far edge", "Cemetery of the Eternals"],
  ] },
  G1_7: { origin: "Cemetery entrance", legs: [
    ["loop", "Follow the perimeter and check both side walls", "The two tomb doors"],
    ["back", "Bring both key pieces back to the waypoint", "Memorial Gate"],
  ] },
  G1_8: { origin: "Mausoleum entrance", legs: [
    ["across", "Try a line through the central wheel tile to the far wall", "Draven"],
    ["follow", "If the far wall is empty, check the long wall from the entrance", "Ribbed arena edge"],
  ] },
  G1_9: { origin: "Tomb entrance", legs: [
    ["screen-up", "Try the upper corridors first; check the center if they dead-end", "Asinia"],
  ] },
  G1_11: { origin: "Hunting Grounds entrance", legs: [
    ["loop", "Sweep the edges and check corner landmarks", "Signpost"],
    ["follow", "Follow the signpost toward the fields", "Ogham Farmlands"],
  ] },
  G1_12: { origin: "Ritual sites", legs: [
    ["follow", "Follow the locusts after each ritual", "Next altar"],
    ["forward", "After three rituals, use the arena altar", "King in the Mists"],
  ] },
  G1_13_1: { origin: "Farmlands entrance", legs: [
    ["across", "Cross to the wall opposite the entrance", "Far wall"],
    ["follow", "Follow that wall if the exit is out of sight", "Ogham Village"],
  ] },
  G1_13_2: { origin: "Village entrance", legs: [
    ["right-wall", "Keep the wall on your right and head up the map", "The Executioner"],
  ] },
  G1_14: { origin: "Ramparts entrance", legs: [
    ["follow", "Follow the ramparts around the U-shaped bend", "Ogham Manor"],
  ] },
  G1_15: { origin: "Manor stairs", legs: [
    ["across", "Cross each floor away from its stair entrance", "Next staircase"],
    ["follow", "On the top floor, find the bridge to the arena", "Count Geonor"],
  ] },
  G2_1: { origin: "Outskirts entrance", legs: [
    ["follow", "Follow the outer edge in the direction the entrance path bends", "Narrow canyon"],
    ["forward", "Take the canyon into the arena", "Rathbreaker"],
  ] },
  G2_2: { origin: "Passage entrance", legs: [
    ["forward", "Look for the curved Six Sisters bridge", "Six Sisters"],
    ["across", "Continue away from the entrance", "The Halani Gates"],
  ] },
  G2_3: { origin: "Locked gates", legs: [
    ["forward", "Go through the openings Asala clears", "Bridges"],
    ["follow", "Follow the bridges away from your entrance", "Jamanra"],
  ] },
  G2_4_1: { origin: "Keth entrance", legs: [
    ["follow", "Take either outer wall toward the far corner", "The Lost City"],
  ] },
  G2_4_2: { origin: "Lost City entrance", legs: [
    ["across", "Cross the V-shaped bridge", "Second section"],
    ["follow", "Sweep the far wall for a wing-shaped approach", "Buried Shrines"],
  ] },
  G2_4_3: { origin: "Shrine entrance", legs: [
    ["across", "Cross the bridges to the second section", "Crown-shaped area"],
    ["forward", "Enter the crown-shaped approach", "Azarian"],
  ] },
  G2_5_1: { origin: "Badlands entrance", legs: [
    ["follow", "Follow an outer wall around the zone", "The Bone Pits"],
  ] },
  G2_5_2: { origin: "Starting bone arch", legs: [
    ["forward", "Keep the heading you took through the arch", "Far wall"],
    ["follow", "Search along that wall for the arena", "Iktab and Ekbab"],
  ] },
  G2_6: { origin: "Sealed grotto entrance", legs: [
    ["loop", "Sweep the outside checkpoints and the gorge rim", "Three Ancient Seals"],
    ["back", "Retrace to the sealed door", "The Titan Grotto"],
  ] },
  G2_7: { origin: "Starting corridor", legs: [
    ["forward", "Use the corridor's heading to cross the rooms", "Far boundary"],
    ["follow", "Look along the wall for the long stair bridge", "Zalmarath"],
  ] },
  G2_8: { origin: "Deshar entrance", legs: [
    ["across", "Cross the open ground into the ruins", "Ruined buildings"],
    ["follow", "Search their far boundary", "Path of Mourning"],
  ] },
  G2_9_1: { origin: "Round platforms", legs: [
    ["across", "Take bridges that lead away from the entrance", "Far edge"],
    ["follow", "Look along the opposite edge", "The Spires of Deshar"],
  ] },
  G2_9_2: { origin: "Spires entrance", legs: [
    ["across", "Cross the connected platforms away from the entrance", "Tor Gul"],
  ] },
  G2_10_1: { origin: "Quarry entrance", legs: [
    ["across", "Cross the bridges in the direction of the main path", "Final bridge"],
    ["forward", "Pass the checkpoint by the bridge", "Mawdun Mine"],
  ] },
  G2_10_2: { origin: "Mine entrance", legs: [
    ["follow", "Follow the rails and their checkpoints", "Rudja's arena"],
  ] },
  G2_11: { origin: "First deck", legs: [
    ["across", "Keep taking gangways that lead farther along the convoy", "Dreadnought"],
  ] },
  G3_1: { origin: "Starting waypoint", legs: [
    ["forward", "Use the direction of the departing path to cross the marsh", "Far edge"],
    ["follow", "Search that boundary", "Ziggurat Encampment"],
  ] },
  G3_3: { origin: "Jungle Ruins entrance", legs: [
    ["follow", "Try an outer wall toward the far side", "Infested Barrens"],
  ] },
  G3_4: { origin: "Crypt entrance", legs: [
    ["follow", "Search the burial chambers off the main passage", "Serpent Priestess corpse"],
    ["forward", "Use the onward exit if it’s closer than the entrance", "Jungle Ruins"],
  ] },
  G3_2_1: { origin: "Alva and the waypoint", legs: [
    ["follow", "Follow the outer boundary", "Chimeral Wetlands"],
  ] },
  G3_2_2: { origin: "First canal", legs: [
    ["across", "Cross each canal after stepping on its pressure pad", "Canal lever"],
  ] },
  G3_5: { origin: "Wetlands entrance", legs: [
    ["follow", "Search along the boundary for the large arena", "Xyclucian"],
  ] },
  G3_6_1: { origin: "Alva's altar", legs: [
    ["forward", "Follow the central corridor and check rooms to either side for cores", "Jiquani's Sanctum"],
  ] },
  G3_6_2: { origin: "Two wings", legs: [
    ["follow", "Explore both wings to power their generators", "Zicoatl"],
  ] },
  G3_7: { origin: "Bog entrance", legs: [
    ["screen-upper-right", "Start by searching the upper-right paths of the local map", "Ignagduk"],
  ] },
  G3_8: { origin: "Drowned City entrance", legs: [
    ["across", "Cross the ambush and keep going into the far ruins", "Apex of Filth"],
  ] },
  G3_9: { origin: "Vault entrance", legs: [
    ["follow", "Follow the vault path to the molten channel", "Mektul"],
  ] },
  G3_11: { origin: "Central lore platform", legs: [
    ["forward", "Go past the platform and through the arch", "Far boundary"],
    ["follow", "Search along the far edge", "The Queen of Filth"],
  ] },
  G3_12: { origin: "Each triangular floor", legs: [
    ["loop", "Check the distant corners for the staircase", "Next floor"],
    ["across", "If a rift splits the floor, cross it and check the corners on the far side", "Ketzuli"],
  ] },
  G3_14: { origin: "Viper's arena", legs: [
    ["forward", "Keep going past the arena and look for stairs", "Aggorat"],
  ] },
  G3_16: { origin: "Chanting platform", legs: [
    ["across", "Cross the platform and continue through the arch", "The Black Chambers"],
  ] },
  G3_17: { origin: "First bridge", legs: [
    ["across", "Keep crossing the linked platforms", "Doryani"],
  ] },
  G4_town: { origin: "Kingsmarch", legs: [
    ["follow", "Go down to the docks and board the ship", "Makoru"],
  ] },
  G4_1_1: { origin: "Dock", legs: [
    ["across", "Head inland from the dock until you reach the far wall", "Far boundary"],
    ["follow", "Search along the far wall", "Volcanic Warrens"],
  ] },
  G4_1_2: { origin: "Warrens entrance", legs: [
    ["across", "Cross the tunnels to the far side", "Krutog's throne"],
  ] },
  G4_2_1: { origin: "Kedge Bay landing", legs: [
    ["follow", "Follow the main shoreline path", "Journey's End"],
  ] },
  G4_2_2: { origin: "Journey's End entrance", legs: [
    ["follow", "Follow the coast toward the far side", "Wreck with the captain's chair"],
  ] },
  G4_3_1: { origin: "Island landing", legs: [
    ["follow", "Follow the shore and outer boundary", "Singing Caverns"],
  ] },
  G4_3_2: { origin: "Cavern entrance", legs: [
    ["loop", "Follow either side of the cavern loop toward the far half", "Diamora"],
  ] },
  G4_4_1: { origin: "Well and challenge rooms", legs: [
    ["forward", "Follow the path through three tests", "Fork"],
    ["follow", "Take the branch toward the halls", "Halls of the Dead"],
  ] },
  G4_4_2: { origin: "Halls entrance", legs: [
    ["follow", "Continue round the outer wall beyond the totems", "Yama"],
  ] },
  G4_4_3: { origin: "Entrance past Yama", legs: [
    ["forward", "Go through to the meeting area", "Navali and Hinekora"],
  ] },
  G4_5_1: { origin: "Prison entrance", legs: [
    ["follow", "Follow connected cell blocks; try the branch at the last checkpoint if a corridor ends", "Solitary Confinement"],
  ] },
  G4_5_2: { origin: "Solitary Confinement entrance", legs: [
    ["follow", "Follow the wall where waves break against it", "The Prisoner"],
  ] },
  G4_7: { origin: "Shrike Island landing", legs: [
    ["follow", "Follow the winding main road to its end", "Scourge of the Skies"],
  ] },
  G4_8b: { origin: "Arastas town edge", legs: [
    ["across", "Cross the coastal ridge on the main path", "Torvian and the Excavation"],
  ] },
  G4_10: { origin: "Excavation entrance", legs: [
    ["forward", "Pass the checkpoint in the connecting chamber", "Second set of rooms"],
    ["follow", "Search its far edges", "Benedictus"],
  ] },
  G4_11_1b: { origin: "Ngakanu landing", legs: [
    ["forward", "Go through the starting building and the gap in the fence", "Outer boundary"],
    ["follow", "Follow the boundary inland", "Heart of the Tribe"],
  ] },
  G4_11_2: { origin: "Landing", legs: [
    ["forward", "Head inland toward the far end; try the opposite passage if the branch stops at a checkpoint", "Tavakai"],
  ] },
  G4_13: { origin: "Dannig’s Expedition", legs: [
    ["forward", "Include the entrance in the explosion chain, then go through it", "Deserted Post"],
  ] },
}
