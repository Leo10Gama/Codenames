// Run dotenv
require('dotenv').config();

const BOT_USER_ID = "827329662044733441";   // The user ID of the bot, for use sometimes
const MOD_USERS = ["233017812820557824"];   // List of "moderator" users who can use override commands
const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs');

// ---------- Necessary constants below ----------

// The prefix for the bot
const PREFIX = "cn.";
// Games currently active
var ACTIVE_GAMES = [];
var SELECTED_PACKS = ["standard"];
// Emojis
const RED_SPYMASTER_EMOJI = '🔴';
const BLUE_SPYMASTER_EMOJI = '🔵';
const RED_OPERATIVE_EMOJI = '🅾️';
const BLUE_OPERATIVE_EMOJI = '0️⃣';
const START_GAME_EMOJI = '✅';
// Prompts and Embeds
var START_PROMPT_EMBED = new Discord.MessageEmbed()
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
    "card_alreadyflipped": "**ERROR**: That card has already been flipped over!",
    "pack_doesntexist": (pack) => `**ERROR**: Card pack \`${pack}\` does not exist. Use \`${PREFIX}packs\` to see all available card packs!`,
    "hint_missing_params": `**ERROR**: Some parameters are missing or malformed. Please use the form \`${PREFIX}hint [word] [number/"inf"]\``,
    "guess_missing_params": `**ERROR**: Some parameters are missing or malformed. Please use the form \`${PREFIX}guess [word]\``,
    "guess_notonboard": (word) => `**ERROR**: The word you guessed \`${word}\` is not on the board. Please guess words that are on the board`,
    "not_inagame": "**ERROR**: You are not participating in a game \:(",
    "not_your_turn": "**ERROR**: It's not your team's turn! Please be patient!!"
};
const MESSAGES = {
    "turn_master_private": (cards) => `${printBoard(cards, true, true)} It's your team's turn! Send me a direct message here with your hint, in the format \n\`${PREFIX}hint [word] [num]\`\n(or use \`inf\` as \`[num]\` for infinity)`,
    "turn_master_public": (colour, master) => `**${colour} team**'s turn! **${master}** is thinking of a hint...`,
    "master_hint_sent": (hint, number) => `Successfully sent the hint \`${hint} ${number}\``,
    "turn_operatives": (colour, hint, number) => `**${colour} operatives**! Your spymaster has given the hint: \n\`${hint} ${number}\`\nGuess words with \`${PREFIX}guess [word]\``,
    "player_selectedcard": (player, card) => `**${player}** selected \`${card.word}\`, which was a **${card.colour}** card!`,
    "gameend_allwordsselected": (winningColour) => `Congratulations **${winningColour}** team! You win!! 🎉🎉`,
    "gameend_assassin": (losingColour) => `Oh no! Since that was the assassin card, **${losingColour}** team loses! Better luck next time!`,
    "pack_removed": (pack) => `Card pack \`${pack}\` removed from selection.`,
    "pack_added": (pack) => `Card pack \`${pack}\` added to selection.`,
    "master_board": (cards, colour) => `${printBoard(cards, true, true)} Don't forget! You are team **${colour}**`,
    "gameend_terminated": `Game ended. GG everyone!`
}
const CARD_PACKS = [
    "standard",
    "hades",
    "countries"
];
// Turn-related (for remembering whose turn it is)
const TURN_RED_MASTER = "Red";
const TURN_RED_OPERATIVES = "red";
const TURN_BLUE_MASTER = "Blue";
const TURN_BLUE_OPERATIVES = "blue";
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
}

/**
 * The constructor function for Game objects
 * @param {Guild} guild The guild (server) in which the game is taking place
 * @param {Channel} active_channel The channel in which the game is taking place
 * @param {boolean} active Whether or not the game is currently active
 * @param {String} turn Which player's turn it is (one of TURN_RED_[MASTER/OPERATIVES] or TURN_BLUE_[MASTER/OPERATIVES])
 * @param {User} redMaster The User whose role in game is the red spymaster
 * @param {User} blueMaster The User whose role in game is the blue spymaster
 * @param {User[]} redOps A collection of Users whose roles are red operatives
 * @param {User[]} blueOps A collection of Users whose roles are blue operatives
 * @param {Card[]} cards The set of Card objects being used in the game
 */
function Game(guild, active_channel, active, turn, redMaster, blueMaster, redOps, blueOps, cards) {
    this.guild = guild;
    this.active_channel = active_channel;
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
        msg.content.toLowerCase();              // make everything smol so it's easier to deal with
        var commands = msg.content.split(" ");  // parse message into subcommands

        /**
         * PING METHOD: mostly for debug
         * @return pong
         */
        if (commands[0] == "ping") {
            msg.channel.send("pong!");
            console.log(msg.author.id);
        }

        /**
         * RULES: Displays the general rules for codenames
         */
        if (commands[0] == "rules") {
            // TODO: Make the rules command lol
        }

        /**
         * START PROMPT: This method will create an embed, which is listened to.
         * The reactions on the embed will indicate which role each player has
         * taken, among the 4 available roles.
         */
        if (commands[0] == "start") {
            // Create embed
            console.log(SELECTED_PACKS);
            msg.channel.send(START_PROMPT_EMBED.fields.length >= 2 ? START_PROMPT_EMBED.spliceFields(1, 1, {name: "Currently selected packs", value: SELECTED_PACKS.join("\n")}) : START_PROMPT_EMBED.addField("Currently selected packs", SELECTED_PACKS.join("\n")))
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
                                prompt.channel.send(printBoard(myGame.cards));
                                // Ping spymaster and send necessary messages
                                myGame.turn == TURN_RED_MASTER ? myGame.blueMaster.send(MESSAGES["master_board"](myGame.cards, TURN_BLUE_MASTER)) : myGame.redMaster.send(MESSAGES["master_board"](myGame.cards, TURN_RED_MASTER));
                                myGame.turn == TURN_RED_MASTER ? myGame.redMaster.send(MESSAGES["turn_master_private"](myGame.cards)) : myGame.blueMaster.send(MESSAGES["turn_master_private"](myGame.cards));
                                prompt.channel.send(MESSAGES["turn_master_public"](myGame.turn, myGame.turn == TURN_RED_MASTER ? myGame.redMaster.username : myGame.blueMaster.username));
                            } catch (err) {
                                console.log(err);
                                msg.channel.send(err);
                            }
                        });
                    })
                })
                .catch(err => msg.channel.send(err));
        }

        /**
         * END PROMPT: If a game is ongoing in the channel, end it
         */
        if (commands[0] == "end") {
            // Get game
            var myGame = null;
            for (const g of ACTIVE_GAMES) {
                if (g.active_channel == msg.channel) myGame = g;
            }
            myGame.active = false;
            myGame.active_channel.send(MESSAGES["gameend_terminated"]);
            flushGames();
        }

        /**
         * HINT PROMPT: This method listens to a private message and, if the hint
         * given is valid, sends it to the channel in which the game is taking
         * place.
         */
        if (commands[0] == "hint") {
            // Get the proper game
            var myGame = null;
            for (const g of ACTIVE_GAMES) {
                if (g.redMaster == msg.author || g.blueMaster == msg.author) myGame = g;
            }
            // Not in a game
            if (myGame == null) msg.channel.send(ERROR_MESSAGES["not_inagame"]);
            else {
                // Malformed command
                if (commands.length != 3) msg.channel.send(ERROR_MESSAGES["hint_missing_params"]);
                // Command is good
                else if (myGame.cards.every((c) => c.word != commands[1].toUpperCase()) && (!isNaN(commands[2]) || commands[2] == "inf")) {
                    // Check if it's the correct turn
                    if ((msg.author == myGame.redMaster && myGame.turn != TURN_RED_MASTER) || (msg.author == myGame.blueMaster && myGame.turn != TURN_BLUE_MASTER)) msg.channel.send(ERROR_MESSAGES["not_your_turn"]);
                    else {
                        myGame.active_channel.send(MESSAGES["turn_operatives"](myGame.turn, commands[1].toUpperCase(), commands[2]));
                        myGame.turn == TURN_RED_MASTER ? myGame.redMaster.send(MESSAGES["master_hint_sent"](commands[1].toUpperCase(), commands[2])) : myGame.blueMaster.send(MESSAGES["master_hint_sent"](commands[1].toUpperCase(), commands[2]));
                        myGame.turn = myGame.turn == TURN_RED_MASTER ? TURN_RED_OPERATIVES : TURN_BLUE_OPERATIVES;
                    }
                } else msg.channel.send(ERROR_MESSAGES["hint_missing_params"]); // params entered wrong or weird
            }
        }

        /**
         * GUESS PROMPT: This method is used by the operatives to guess words after their
         * spymaster has given them a hint
         */
        if (commands[0] == "guess") {
            // Verify command is formed right
            if (commands.length >= 2) {
                // Get the game
                var myGame = null;
                for (const g of ACTIVE_GAMES) {
                    if (g.redOps.includes(msg.author) || g.blueOps.includes(msg.author)) myGame = g;
                }
                // Not in a game
                if (myGame == null) msg.channel.send(ERROR_MESSAGES["not_inagame"]);
                else {
                    var endGame = false;
                    // Verify it's the proper turn
                    var myGuess = "";
                    for (var i = 1; i < commands.length; i++) {
                        myGuess += commands[i] + " ";
                    }
                    myGuess = myGuess.trim().toUpperCase();
                    if ((myGame.turn == TURN_RED_OPERATIVES && myGame.redOps.includes(msg.author)) || (myGame.turn == TURN_BLUE_OPERATIVES && myGame.blueOps.includes(msg.author))) {
                        // Verify the word is on the board
                        if (myGame.cards.some((c) => c.word == myGuess && !c.flipped)) {
                            // Flip the card over (card <- the card that was just flipped)
                            var card = flipCard(myGame.cards, myGuess);
                            myGame.active_channel.send(MESSAGES["player_selectedcard"](msg.author, card));
                            myGame.active_channel.send(printBoard(myGame.cards, false));
                            // Word doesn't belong to that team, change turns and send necessary messages
                            if ((myGame.turn == TURN_RED_OPERATIVES && card.colour != CARD_RED) || (myGame.turn == TURN_BLUE_OPERATIVES && card.colour != CARD_BLUE)) {
                                myGame.turn = myGame.turn == TURN_RED_OPERATIVES ? TURN_BLUE_MASTER : TURN_RED_MASTER;
                                // Card is the assassin card, end the game
                                if (card.colour == CARD_ASSASSIN) {
                                    myGame.active_channel.send(MESSAGES["gameend_assassin"](myGame.turn == TURN_BLUE_MASTER ? TURN_RED_MASTER : TURN_BLUE_MASTER));
                                    myGame.active_channel.send(MESSAGES["gameend_allwordsselected"](myGame.turn));
                                    endGame = true;
                                } else {
                                    myGame.active_channel.send(MESSAGES["turn_master_public"](myGame.turn, myGame.turn == TURN_RED_MASTER ? myGame.redMaster : myGame.blueMaster));
                                    myGame.turn == TURN_RED_MASTER ? myGame.redMaster.send(MESSAGES["turn_master_private"](myGame.cards)) : myGame.blueMaster.send(MESSAGES["turn_master_private"](myGame.cards));
                                }
                            // Word was for our team, don't change but check if that was our win condition
                            } else {
                                // That was the last card for that team; they win, end the game
                                if (colourWon(myGame.cards, myGame.turn == TURN_RED_OPERATIVES ? CARD_RED : CARD_BLUE)) {
                                    myGame.active_channel.send(MESSAGES["gameend_allwordsselected"](myGame.turn == TURN_RED_OPERATIVES ? TURN_RED_MASTER : TURN_BLUE_MASTER));
                                    endGame = true;
                                }
                            }
                        } else myGame.active_channel.send(ERROR_MESSAGES["guess_notonboard"](myGuess));
                    } else myGame.active_channel.send(ERROR_MESSAGES["not_your_turn"]);
                    // Game was removed, so put it BACK if someone didn't win
                    if (endGame) {
                        myGame.active = false;
                        flushGames();
                    }
                }
            } else msg.channel.send(ERROR_MESSAGES["guess_missing_params"]);
        }

        /**
         * PASS COMMAND: Once done guessing, pass the turn to the next spymaster
         */
        if (commands[0] == "pass") {
            // Get the game
            var myGame = null;
            for (const g of ACTIVE_GAMES) {
                if (g.redOps.includes(msg.author) || g.blueOps.includes(msg.author)) myGame = g;
            }
            // Not in a game
            if (myGame == null) msg.channel.send(ERROR_MESSAGES["not_inagame"]);
            else {
                var preTurn = myGame.turn;
                myGame.turn = (myGame.turn == TURN_RED_OPERATIVES && myGame.redOps.includes(msg.author)) ? TURN_BLUE_MASTER : (myGame.turn == TURN_BLUE_OPERATIVES && myGame.blueOps.includes(msg.author)) ? TURN_RED_MASTER : myGame.turn;
                if (preTurn != myGame.turn) {
                    myGame.active_channel.send(MESSAGES["turn_master_public"](myGame.turn, myGame.turn == TURN_RED_MASTER ? myGame.redMaster : myGame.blueMaster));
                    myGame.turn == TURN_RED_MASTER ? myGame.redMaster.send(MESSAGES["turn_master_private"](myGame.cards)) : myGame.blueMaster.send(MESSAGES["turn_master_private"](myGame.cards));
                } else {
                    myGame.active_channel.send(ERROR_MESSAGES["not_your_turn"]);
                }
            }
        }

        /**
         * PACK COMMAND: This method is used to either list or toggle available card
         * packs for the next game. It only allows packs available in CARD_PACKS, which
         * lists packs in the "Word Packs" folder.
         */
        if (commands[0] == "packs") {
            if (commands[1] == "toggle" || CARD_PACKS.includes(commands[1])) {          // Switch an active pack to off (or on)
                var packToToggle = commands[1] == "toggle" ? commands[2] : commands[1]
                if (CARD_PACKS.includes(packToToggle)) {
                    if (SELECTED_PACKS.includes(packToToggle)) {
                        SELECTED_PACKS.splice(SELECTED_PACKS.indexOf(packToToggle), 1);
                        msg.channel.send(MESSAGES["pack_removed"](packToToggle));
                    } else {
                        SELECTED_PACKS.push(packToToggle);
                        msg.channel.send(MESSAGES["pack_added"](packToToggle));
                    }
                } else {
                    msg.channel.send(ERROR_MESSAGES["pack_doesntexist"](packToToggle));
                }
            } else {                            // List all active packs
                var myMessage = "Currently active packs:\n\`\`\`\n";
                if (SELECTED_PACKS.length == 0) myMessage += "[no packs currently selected]";
                else myMessage += SELECTED_PACKS.join("\n");
                myMessage += "\`\`\`";
                msg.channel.send(myMessage);
            }
        }

        /**
         * DEBUG COMMAND: Method used only by me (and individuals whitelisted by me)
         * to show inner workings of the code and solve debug issues
         */
        if (commands[0] == "debug" && MOD_USERS.includes(msg.author.id)) {
            if (commands[1] == "activegames") console.log(JSON.stringify(ACTIVE_GAMES, null, 3));
            if (commands[1] == "currentgame") console.log(JSON.stringify(ACTIVE_GAMES.filter((g) => g.active_channel == msg.channel), null, 3));
        }
    }
});

/**
 * Function to create a Game object from a ReactionCollector's return parameter
 * @param {Collection<MessageReaction>} collected A collection of the reactions on the 
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
    if (bos.includes(rm) || ros.includes(rm) || bos.includes(bm) || ros.includes(bm) || rm == bm) throw ERROR_MESSAGES["multiple_roles"];
    for (ro of ros) if (bos.includes(ro)) throw ERROR_MESSAGES["multiple_roles"];
    // Decide who's turn it is
    t = (Math.random() * 2) > 1 ? TURN_RED_MASTER : TURN_BLUE_MASTER;
    // Get the wordbank for the game 
    if (SELECTED_PACKS.length == 0) SELECTED_PACKS.push("standard");
    c = getCards(SELECTED_PACKS, t == TURN_RED_MASTER ? 9 : 8, t == TURN_BLUE_MASTER ? 9 : 8);
    // Create and return the actual Game object
    var myGame = new Game(collected.first().guild, collected.first().message.channel, true, t, rm, bm, ros, bos, c);
    ACTIVE_GAMES.push(myGame);
    return myGame;
}

/**
 * Function to generate 25 card objects from a list of available word banks
 * @pre `r` and `b` together sum to a number < 24
 * @param {String[]} cardPacks An array of strings that directly reference a list of
 *      available card packs to draw from
 * @param {int} r The number of red cards to put in the array
 * @param {int} b The number of blue cards to put in the array
 * @return {Card[]} An array of 25 cards whose words have been randomly selected from
 *      those in cardPacks, with `r` red cards, `b` blue cards, and one assasin card
 */
function getCards(cardPacks, r, b) {
    // Put all available words in an array
    var words = [];
    for (const pack of cardPacks) {
        var newWords = fs.readFileSync(`Word Packs/${pack}.txt`, {encoding:'utf8'}).split('\n')
        words = words.concat(newWords);
    }
    // Make sure formatting is correct
    for (var word of words) {
        if (word[word.length - 1] == '\r') {
            words[words.indexOf(word)] = (word.substr(0, word.length - 1));
        }
    }
    // Remove duplicates
    words = words.filter((word, index) => words.indexOf(word) === index);
    // Pick out 25 words to play with
    var cardWords = [];
    for (var i = 0; i < 25; i++) {
        var randIndex = Math.floor(Math.random() * (words.length - 1));
        cardWords.push(words[randIndex]);
        words.splice(randIndex, 1);
    }
    // Randomly assign colours as inserting to card array
    cardArray = []
    // Red words
    for (var i = 0; i < r; i++) {
        var randIndex = Math.floor(Math.random() * (cardWords.length - 1));
        cardArray.push(new Card(CARD_RED, cardWords[randIndex], false));
        cardWords.splice(randIndex, 1);
    }
    // Blue words
    for (var i = 0; i < b; i++) {
        var randIndex = Math.floor(Math.random() * (cardWords.length - 1));
        cardArray.push(new Card(CARD_BLUE, cardWords[randIndex], false));
        cardWords.splice(randIndex, 1);
    }
    // Assasin card
    var randIndex = Math.floor(Math.random() * (cardWords.length - 1));
    cardArray.push(new Card(CARD_ASSASSIN, cardWords[randIndex], false));
    cardWords.splice(randIndex, 1);
    // Remainder of cards
    for (var word of cardWords) {
        cardArray.push(new Card(CARD_NEUTRAL, word, false));
    }
    // Shuffle the values
    cardArray = cardArray.sort(() => Math.random() - 0.5);
    // Return the final card array
    return cardArray;
}

/**
 * Create a string to represent a display of all card objects in a game
 * @pre The `cards` param is of size exactly 25
 * @param {Card[]} cards The array of cards currently in play
 * @param {boolean} showAll Whether or not to flip all the cards
 * @param {boolean} hideFlipped Whether or not to cross out cards that have already been guessed
 * @return {String} A string (encased in ``` symbols) to be sent as a Discord message
 */
function printBoard(cards, showAll = false, hideFlipped = false) {
    // Set up constants to use for printing
    const BOARD_ROWS = 5;
    const BOARD_COLS = 5;
    const MAX_WORD_SIZE = 12;
    const VERT_DIVIDE_CHAR = "-";
    const HORI_DIVIDE_CHAR = "|";
    const BLUE_FILL_CHAR = "🟦";
    const RED_FILL_CHAR = "🟥";
    const WHITE_FILL_CHAR = "⬜";
    const BLACK_FILL_CHAR = "⬛";
    const FLIPPED_CHAR = "✖️";
    const VERTICAL_DIVIDER = VERT_DIVIDE_CHAR.repeat(13).repeat(5) + VERT_DIVIDE_CHAR;
    const HORIZONTAL_DIVIDER_COLOUR = (colour) => HORI_DIVIDE_CHAR + " " + (colour == CARD_BLUE ? BLUE_FILL_CHAR : colour == CARD_RED ? RED_FILL_CHAR : colour == CARD_ASSASSIN ? BLACK_FILL_CHAR : WHITE_FILL_CHAR).repeat(4) + " ";
    const HORIZONTAL_DIVIDER_FLIPPED = HORI_DIVIDE_CHAR + " " + FLIPPED_CHAR.repeat(4) + " ";
    const HORIZONTAL_DIVIDER_EMPTY = HORI_DIVIDE_CHAR + " ".repeat(12);
    const HORIZONTAL_DIVIDER_WORD = (word) => HORI_DIVIDE_CHAR + word;
    // Create first instance of string
    var result = "```\n";
    for (var y = 0; y < BOARD_ROWS; y++) {
        // Make divider
        result += VERTICAL_DIVIDER + "\n";
        // Collect the row of 5 cards to format after loop
        var row = [];
        for (var x = 0; x < BOARD_COLS; x++) {
            row[x] = cards[(y * BOARD_ROWS) + x];
        }
        // Row of colours
        for (var card of row) {
            if ((card.flipped || showAll) && !(hideFlipped && card.flipped)) {
                result += HORIZONTAL_DIVIDER_COLOUR(card.colour);
            } else if (hideFlipped && card.flipped) {
                result += HORIZONTAL_DIVIDER_FLIPPED;
            } else {
                result += HORIZONTAL_DIVIDER_EMPTY;
            }
        }
        result += HORI_DIVIDE_CHAR + "\n";
        // Row of words
        for (var card of row) {
            word = card.word;
            while (word.length < MAX_WORD_SIZE) {
                if (word.length % 2 == 1) word = " " + word;
                else word += " ";
            }
            result += HORIZONTAL_DIVIDER_WORD(word);
        }
        result += HORI_DIVIDE_CHAR + "\n";
    }
    // Cap off text and send it off
    result += VERTICAL_DIVIDER + "```";
    return result;
}

/**
 * Flip over a specific card from within a given card array, and return that instance
 * @param {Card[]} cards The array of cards to search through
 * @param {String} word The word on the card to flip
 * @returns {Card} Either the card that was just flipped, or null if the card does
 *      not exist
 */
function flipCard(cards, word) {
    var c = null;
    for (const card of cards) {
        if (card.word == word) {
            c = card;
            card.flipped = true;
            break;
        }
    }
    return c;
}

/**
 * Search through an array of Cards and check whether all cards of a given colour
 * have been flipped over (thus, that team wins)
 * @param {Card[]} cards The array of cards to search through
 * @param {String} colour One of [CARD_RED, CARD_BLUE]
 * @return {Boolean} Whether or not team "colour" has won the game
 */
function colourWon(cards, colour) {
    return cards.every((c) => c.colour == colour ? c.flipped : true);
}

/**
 * Function called to remove all finished games stored in ACTIVE_GAMES
 */
function flushGames() {
    ACTIVE_GAMES = ACTIVE_GAMES.filter((g) => g.active);
}

client.login(process.env.DISCORD_TOKEN);