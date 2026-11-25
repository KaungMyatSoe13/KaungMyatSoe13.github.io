/**
 * 90s arcade games for the cards that float behind the landing. `cover`: the game's flyer or
 * cover (public/landing/covers/, 400 wide WebP, from each game's Wikipedia infobox). The
 * games and their art belong to their publishers; without a cover the card gets painted art.
 */
export const arcadeGames: { title: string; year: string; genre: string; cover?: string }[] = [
  { title: "Street Fighter II", year: "1991", genre: "Fighting", cover: "/landing/covers/street-fighter-ii.webp" },
  { title: "Sunset Riders", year: "1991", genre: "Run & gun", cover: "/landing/covers/sunset-riders.webp" },
  { title: "Mortal Kombat", year: "1992", genre: "Fighting", cover: "/landing/covers/mortal-kombat.webp" },
  { title: "NBA Jam", year: "1993", genre: "Sports", cover: "/landing/covers/nba-jam.webp" },
  { title: "Daytona USA", year: "1994", genre: "Racing", cover: "/landing/covers/daytona-usa.webp" },
  { title: "Tekken", year: "1994", genre: "Fighting", cover: "/landing/covers/tekken.webp" },
  { title: "Puzzle Bobble", year: "1994", genre: "Puzzle", cover: "/landing/covers/puzzle-bobble.webp" },
  { title: "Time Crisis", year: "1995", genre: "Shooter", cover: "/landing/covers/time-crisis.webp" },
  { title: "Metal Slug", year: "1996", genre: "Run & gun", cover: "/landing/covers/metal-slug.webp" },
  { title: "The House of the Dead", year: "1996", genre: "Shooter", cover: "/landing/covers/house-of-the-dead.webp" },
  { title: "Marvel vs. Capcom", year: "1998", genre: "Fighting", cover: "/landing/covers/marvel-vs-capcom.webp" },
  { title: "Dance Dance Revolution", year: "1998", genre: "Rhythm", cover: "/landing/covers/ddr.webp" },
  { title: "Crazy Taxi", year: "1999", genre: "Driving", cover: "/landing/covers/crazy-taxi.webp" },
];
