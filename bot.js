// Run dotenv
require('dotenv').config();

const BOT_USER_ID = "827329662044733441"; //The user ID of the bot, for use sometimes
const Discord = require('discord.js');
const client = new Discord.Client();

// ---------- Necessary constants below ----------

// The prefix for the bot
const PREFIX = "cn.";
// Games currently active
var ACTIVE_GAMES = [];
// Emojis
const RED_SPYMASTER_EMOJI = '🔴';
const BLUE_SPYMASTER_EMOJI = '🔵';
const RED_OPERATIVE_EMOJI = '🅾️';
const BLUE_OPERATIVE_EMOJI = '0️⃣';
const START_GAME_EMOJI = '✅';
// Prompts and Embeds
const START_PROMPT_EMBED = new Discord.MessageEmbed()
    .setTitle("Codenames")
    .setColor('#E0D12B')
    .setDescription(`Codenames is a game in which two spymasters help their team of operatives to figure out which clues are theirs! 
        React to this message to decide your role for the game.\n
        For a better explanation of the rules, use \`${PREFIX}rules\``)
    .addField("Available roles", `
        ${RED_SPYMASTER_EMOJI}: Red Spymaster (1 per game)\n
        ${BLUE_SPYMASTER_EMOJI}: Blue spymaster (1 per game)\n
        ${RED_OPERATIVE_EMOJI}: Red operative (team of 1+)\n
        ${BLUE_OPERATIVE_EMOJI}: Blue operative (team of 1+)\n
        ${START_GAME_EMOJI}: Start the game with these settings`, true);
const ERROR_MESSAGES = {
    "two_spymasters": "**ERROR**: Cannot have 2 spymasters, cancelling game...",
    "not_enough_reactions": "**ERROR**: One or more roles have not been taken, cancelling game...",
    "timeout": "**ERROR**: Took too long to start game, ping again if you're still interested.",
    "multiple_roles": "**ERROR**: One or more players have chosen multiple roles, cancelling game...",
    "invalid_hint": "**ERROR**: Invalid hint. Please keep your hint in the format `[word] [num]`, where `[word]` is one word (not on the board) and `[num]` is either an integer number or `inf`!",
    "invalid_guess": "**ERROR**: That word is not on the board! Please try again.",
    "card_alreadyflipped": "**ERROR**: That card has already been flipped over!"
};
const MESSAGES = {
    "turn_master_private": `It's your team's turn! Send me a direct message here with your hint, in the format \n\`${PREFIX}hint [word] [num]\`\n(or use \`inf\` as \`[num]\` for infinity)`,
    "turn_master_public": (colour, master) => `**${colour} team**'s turn! **${master}** is thinking of a hint...`,
    "turn_operatives": (colour, hint) => `**${colour} operatives**! Your spymaster has given the hint: \`${hint}\`. Guess which words with \`${PREFIX}guess [word]\``,
    "player_selectedcard": (player, card) => `**${player}** selected \`${card.word}\`, which was a **${card.colour}** card!`,
    "gameend_allwordsselected": (colour) => `Congratulations **${colour}** team! You win!! 🎉🎉`,
    "gameend_assassin": (colour) => `Oh no! Since that was the assassin card, **${colour}** team loses! Better luck next time!`
}
// Turn-related (for remembering whose turn it is)
const TURN_RED = "Red";
const TURN_BLUE = "Blue";
// Card Colours
const CARD_RED = "red";
const CARD_BLUE = "blue";
const CARD_NEUTRAL = "white";
const CARD_ASSASSIN = "black";

// Object Constructors

/**
 * The constructor function for Card objects
 * @param {String} colour The colour of the card (one of CARD_RED, CARD_BLUE,
 *      CARD_NEUTRAL, CARD_ASSASSIN)
 * @param {String} word The word on the card
 * @param {boolean} flipped Whether or not the card has been flipped over
 */
function Card(colour, word, flipped) {
    this.colour = colour;
    this.word = word;
    this.flipped = flipped;
    /**
     * Flip over a card if it hasn't yet been flipped
     * @return {boolean} True if the card has been flipped over successfully
     */
    this.flip = () => {
        if (!this.flipped) this.flipped = true;
        return this.flipped;
    }
}

/**
 * The constructor function for Game objects
 * @param {Guild} guild The guild (server) in which the game is taking place
 * @param {boolean} active Whether or not the game is currently active
 * @param {String} turn Which player's turn it is (one of TURN_RED or TURN_BLUE)
 * @param {User} redMaster The User whose role in game is the red spymaster
 * @param {User} blueMaster The User whose role in game is the blue spymaster
 * @param {User[]} redOps A collection of Users whose roles are red operatives
 * @param {User[]} blueOps A collection of Users whose roles are blue operatives
 * @param {Card[]} cards The set of Card objects being used in the game
 */
function Game(guild, active, turn, redMaster, blueMaster, redOps, blueOps, cards) {
    this.guild = guild;
    this.active = active;
    this.turn = turn;
    this.redMaster = redMaster;
    this.blueMaster = blueMaster;
    this.redOps = redOps;
    this.blueOps = blueOps;
    this.cards = cards;
}

// ---------- End necessary constants ----------

// When bot is loaded, give initialization message
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Listen for message
client.on('message', async msg => {
    if (msg.author.id == BOT_USER_ID) return;   // dont reply to yourself
    // Detect prefix
    if (msg.content.substr(0, 3) == PREFIX) {
        msg.content = msg.content.substr(3);    // trim message

        /**
         * PING METHOD: mostly for debug
         * @return pong
         */
        if (msg.content == "ping") {
            msg.channel.send("pong!");
        }

        /**
         * RULES: Displays the general rules for codenames
         */
        if (msg.content == "rules") {
            // TODO: Make the rules command lol
        }

        /**
         * BEGIN PROMPT: This method will create an embed, which is listened to.
         * The reactions on the embed will indicate which role each player has
         * taken, among the 4 available roles.
         */
        if (msg.content == "start") {
            // Create embed
            msg.channel.send(START_PROMPT_EMBED)
                .then(prompt => {
                    // React on embed with options
                    prompt.react(RED_SPYMASTER_EMOJI)
                    .then(prompt.react(BLUE_SPYMASTER_EMOJI))
                    .then(prompt.react(RED_OPERATIVE_EMOJI))
                    .then(prompt.react(BLUE_OPERATIVE_EMOJI))
                    .then(prompt.react(START_GAME_EMOJI))
                    .then( () => {
                        // Await reactions (1 minute max)
                        const filter = (reaction, user) => (([RED_SPYMASTER_EMOJI, BLUE_SPYMASTER_EMOJI, RED_OPERATIVE_EMOJI, 
                            BLUE_OPERATIVE_EMOJI, START_GAME_EMOJI].includes(reaction.emoji.name)) && (user.id != BOT_USER_ID));
                        const collector = prompt.createReactionCollector(filter, { time: 60000 });
                        collector.on('collect', r => {
                            //console.log(`Collected ${r.emoji.toString()} from ${r.users.cache.last().username}`);
                            if (r.emoji.name == START_GAME_EMOJI) collector.stop(`${r.users.cache.last().username} started a game`)
                        });
                        // Take reactions and create the game
                        collector.on('end', (collected, reason) => {      // note: `collected` is a collection of `MessageReaction`s, `reason` is a string
                            console.log(reason);        // indicates who started the game (or if it timed out)
                            if (reason == "time") {
                                msg.channel.send(ERROR_MESSAGES["timeout"]);
                                return;
                            }
                            // Create the game object
                            try {
                                var myGame = startGame(collected);
                                // Send the board and indicate whose turn it is
                                // TODO: some sort of printBoard() function
                                // Ping spymaster and send necessary messages
                                myGame.turn == TURN_RED ? myGame.redMaster.send(MESSAGES["turn_master_private"]) : myGame.blueMaster.send(MESSAGES["turn_master_private"]);
                                prompt.channel.send(MESSAGES["turn_master_public"](myGame.turn, myGame.turn == TURN_RED ? myGame.redMaster.username : myGame.blueMaster.username));
                            } catch (err) {
                                console.log(err);
                                msg.channel.send(err);
                            }
                        });
                    })
                })
                .catch(err => msg.channel.send(err));
        }

    }
});

/**
 * Function to create a Game object from a ReactionCollector's return parameter
 * @param {Collection<NessageReaction>} collected A collection of the reactions on the 
 *      "start game" prompt, which should contain all the necessary variables to start 
 *      the game
 * @return {Game} The newly created Game object, which will have been added to the 
 * @throws {String} An error message if there are not enough valid parameters to start 
 *      the game, or the parameters passed produces a game that should not be possible
 */
function startGame(collected) {
    // Initialize temp variables
    var rm = null; var bm = null; var t = null;
    var ros = []; var bos = []; var c = [];
    // Helper function to store the users that reacted to an emoji into the correct group
    var storeEmoji = (e, group, isMaster) => {
        // * collected.get(e).users.cache is a Map of <emoji>: <User>
        if (collected.get(e).users.cache.values().size < 2) throw ERROR_MESSAGES["not_enough_reactions"];
        else if (collected.get(e).users.cache.values().size > 2 && isMaster) throw ERROR_MESSAGES["two_spymasters"];
        for (const u of collected.get(e).users.cache.values()) {
            if (u.id === BOT_USER_ID) continue;
            else if (isMaster) group = u;
            else group.push(u);
        }
        return group;
    }
    // Iterate through the reactions and assign the respective roles (put into temp variables)
    for (const emoji of collected.keys()) {
        switch(emoji) {
            case RED_SPYMASTER_EMOJI:
                rm = storeEmoji(emoji, rm, true);
                break;
            case BLUE_SPYMASTER_EMOJI:
                bm = storeEmoji(emoji, bm, true);
                break;
            case RED_OPERATIVE_EMOJI:
                ros = storeEmoji(emoji, ros, false);
                break;
            case BLUE_OPERATIVE_EMOJI:
                bos = storeEmoji(emoji, bos, false);
                break;
            default:
                break;
        }
    }
    if ((rm == null) || (bm == null) || (bos.length == 0) || (ros.length == 0)) throw ERROR_MESSAGES["not_enough_reactions"];
    // Prevent one person having the same role

    /**     commented out for debug reasons
    if (bos.includes(rm) || ros.includes(rm) || bos.includes(bm) || ros.includes(bm) || rm == bm) throw ERROR_MESSAGES["multiple_roles"];
    for (ro of ros) if (bos.includes(ro)) throw ERROR_MESSAGES["multiple_roles"];
    */

    // Decide who's turn it is
    t = Math.random() * 2 > 1 ? TURN_RED : TURN_BLUE;
    // Get the wordbank for the game 
    // TODO: Generate 25 Card objects; 9 for the colour whose turn it is, 8 for the other, 1 assassin (black), rest neutral (white)
    // Create and return the actual Game object
    var myGame = new Game(collected.first().guild, true, t, rm, bm, ros, bos, c);
    ACTIVE_GAMES.push(myGame);
    return myGame;
}

client.login(process.env.DISCORD_TOKEN);