/**
 * @name Command Center
 * @version 1.0.2
 * @description Several slash commands to have fun with, and custom commands functionality.
 * @license MIT
 * @author CRAWNiiK
 * @authorId 518240643156541470
 * @website https://github.com/CanslerW/BetterDiscord_plugins/tree/main
 * @source hhttps://raw.githubusercontent.com/CanslerW/BetterDiscord_plugins/refs/heads/main/FamqModer.plugin.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_CHANGELOG = [
  {
    title: '1.0.2',
    type: 'added',
    items: ['Added /avatar, /urban2'],
  },
];

const SETTINGS_KEY = 'settings';
const CURRENT_VERSION_INFO_KEY = 'currentVersionInfo';
const DEFAULT_SETTINGS = {};

class Utils {
  static SettingItem(options) {
    return {
      ...options,
      type: 'custom',
    };
  }

  static isObject(object) {
    return typeof object === 'object' && !!object && !Array.isArray(object);
  }

  static isValidIPv4(ip) {
    const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ip);
  }
}

class BaseService {
  plugin;
  bdApi;
  logger;

  constructor(plugin) {
    this.plugin = plugin;
    this.bdApi = this.plugin.bdApi;
    this.logger = this.bdApi.Logger;
  }
}

class SettingsService extends BaseService {
  settings = DEFAULT_SETTINGS;

  start() {
    const savedSettings = this.bdApi.Data.load(SETTINGS_KEY);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);

    return Promise.resolve();
  }

  stop() {
    // Do nothing
  }
}

class ModulesService extends BaseService {
  dispatcher;
  commandsModule = {};
  messageModule;
  channelModule;

  start() {
    this.dispatcher = BdApi.Webpack.getModule(BdApi.Webpack.Filters.byKeys('dispatch', 'subscribe'));

    this.commandsModule.module = BdApi.Webpack.getModule((exports) => {
      if (!Utils.isObject(exports)) return false;
      if (exports.Z !== undefined) return false;

      return Object.entries(exports).some(([key, value]) => {
        if (!(typeof value === 'function')) return false;
        const valueString = value.toString();

        const match = valueString.includes('BUILT_IN_INTEGRATION') && valueString.includes('BUILT_IN_TEXT');
        if (match) this.commandsModule.key = key;

        return match;
      });
    });

    this.messageModule = BdApi.Webpack.getModule(BdApi.Webpack.Filters.byKeys('sendMessage'));
    this.channelModule = BdApi.Webpack.getStore('SelectedChannelStore');

    Object.entries(this).forEach(([key, value]) => {
      if (value !== undefined) return;
      this.logger.error(`${key} not found!`);
    });

    return Promise.resolve();
  }

  stop() {
    // Do nothing
  }
}

class UrbanDictionaryService extends BaseService {
  async lookup(term) {
    try {
      const response = await BdApi.Net.fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
      const data = await response.json();

      if (data.result_type === 'no_results') {
        return `No results found for "${term}" on Urban Dictionary.`;
      }

      const definition = data.list[0].definition;
      const example = data.list[0].example;
      return `**${encodeURIComponent(term)}**\n**Definition**: ${definition}\n**Example**: ${example}`;
    } catch (error) {
      this.logger.error('Error looking up term:', error);
      return 'An error occurred while looking up the term.';
    }
  }
}

class LmgtfyService {
  generateLink(query) {
    return `https://letmegooglethat.com/?q=${encodeURIComponent(query)}`;
  }
}

class WebsterDictionaryService extends BaseService {
  async lookup(term) {
    try {
      const response = await BdApi.Net.fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
      const data = await response.json();

      if (data.title === "No Definitions Found") {
        return `No results found for "${term}" on Webster's Dictionary.`;
      }

      const definition = data[0].meanings[0].definitions[0].definition;
      const example = data[0].meanings[0].definitions[0].example;
      return `**${encodeURIComponent(term)}**\n**Definition**: ${definition}\n**Example**: ${example || 'No example available.'}`;
    } catch (error) {
      this.logger.error('Error looking up term:', error);
      return 'An error occurred while looking up the term on Webster\'s Dictionary.';
    }
  }
}

class WhoisService {
  async lookup(ip) {
    try {
      const response = await BdApi.Net.fetch(`https://geolocation-db.com/json/${ip}&position=true`);
      const data = await response.json();

      if (!data.country_name) {
        return `No WHOIS data found for IP address "${ip}".`;
      }

      const { country_name, state, city, IPv4 } = data;
      return `**IP Address**: ${IPv4}\n**Country**: ${country_name}\n**State**: ${state || 'N/A'}\n**City**: ${city || 'N/A'}`;
    } catch (error) {
      this.logger.error('Error looking up IP address:', error);
      return 'An error occurred while looking up the IP address.';
    }
  }
}

class QRCodeService extends BaseService {
  async generateQRCode(url) {
    try {
      const apiUrl = `https://gifstuffapi.com/qr/?url=${encodeURIComponent(url)}`;
      const response = await BdApi.Net.fetch(apiUrl);
      const data = await response.json();

      if (!data.url) {
        this.logger.error('No URL found in the API response:', data);
        return null;
      }

      return data.url; // Return the URL from the JSON response
    } catch (error) {
      this.logger.error('Error generating QR code:', error);
      return null;
    }
  }
}

class ReminderService extends BaseService {
  reminders = new Map();

  async setReminder(userId, time, message, channelId) {
    const timeout = setTimeout(() => {
      this.sendReminder(userId, message, channelId);
      this.reminders.delete(userId);
    }, time);

    this.reminders.set(userId, timeout);
  }

  async sendReminder(userId, message, channelId) {
    const { sendMessage } = BdApi.findModuleByProps('sendMessage');

    if (!channelId) return;

    sendMessage(channelId, {
      content: `<@${userId}>, reminder: ${message}`,
      invalidEmojis: [],
      tts: false,
      validNonShortcutEmojis: [],
    });
  }
}

class PatchesService extends BaseService {
  profilePicCommand;
  urbanCommand;
  urban2Command; // New command for detailed Urban Dictionary lookup
  lmgtfyCommand;
  petPetCommand;
  swirlCommand; // New swirl command
  defineCommand;
  whoisCommand;
  rainbowCommand;
  qrCommand; // New QR code command
  pizzaCommand;
  moneyCommand;
  remindCommand; // New remind command

  start(modulesService, settingsService) {
    const profilePicName = 'avatar';
    const profilePicDescription = 'Get the avatar URL for a user';
    const urbanName = 'urbanlookup';
    const urbanDescription = 'Look up a term on Urban Dictionary';
    const urban2Name = 'urban2'; // New command name
    const urban2Description = 'Look up a term on Urban Dictionary and display detailed definitions in an alert window'; // New command description
    const lmgtfyName = 'lmgtfy';
    const lmgtfyDescription = 'Generate a "Let Me Google That For You" link';
    const petPetName = 'petpet';
    const petPetDescription = 'Generate a PetPet GIF from the user avatar';
    const swirlName = 'swirl'; // New command name
    const swirlDescription = 'Generate a Swirl GIF from the user avatar'; // New command description
    const defineName = 'define';
    const defineDescription = 'Look up a term on Webster\'s Dictionary';
    const whoisName = 'whois';
    const whoisDescription = 'Look up WHOIS information for an IP address';
    const rainbowName = 'rainbow';
    const rainbowDescription = 'Post a rainbow video URL';
    const qrName = 'qr'; // New command name
    const qrDescription = 'Generate a QR code for the given URL'; // New command description
    const pizzaName = 'pizza'; // New command name
    const pizzaDescription = 'Generate a Pizza GIF from the user avatar'; // New command description
    const moneyName = 'money'; // New command name
    const moneyDescription = 'Generate a Money GIF from the user avatar'; // New command description
    const remindName = 'remind'; // New command name
    const remindDescription = 'Set a reminder for a user'; // New command description

    // Avatar command (unchanged)
    this.profilePicCommand = {
      id: 'Avatar-Command',
      untranslatedName: profilePicName,
      displayName: profilePicName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: profilePicDescription,
      displayDescription: profilePicDescription,
      options: [
        {
          name: 'user',
          displayName: 'User',
          description: 'The user to get the avatar URL for',
          displayDescription: 'The user to get the avatar URL for',
          required: true,
          type: 6, // USER
        },
      ],
      execute: async (event) => {
        try {
          const { sendMessage } = BdApi.findModuleByProps('sendMessage');
          const { getUser } = BdApi.findModuleByProps('getUser');
          const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();

          const userId = event[0]?.value ?? '';
          if (!userId) return;

          const user = getUser(userId);
          if (!user) {
            sendMessage(channelId, { content: "User not found!" });
            return;
          }

          const profilePicUrl = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`;

          sendMessage(channelId, {
            content: profilePicUrl,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        } catch (error) {
          this.logger.error('Error executing avatar command:', error);
        }
      },
    };

    // Urban Dictionary lookup command (unchanged)
    this.urbanCommand = {
      id: 'UrbanDictionary-Lookup',
      untranslatedName: urbanName,
      displayName: urbanName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: urbanDescription,
      displayDescription: urbanDescription,
      options: [
        {
          name: 'term',
          displayName: 'Term',
          description: 'The term to look up on Urban Dictionary',
          displayDescription: 'The term to look up on Urban Dictionary',
          required: true,
          type: 3, // STRING
        },
      ],
      execute: async (event) => {
        try {
          const term = event[0]?.value ?? '';
          if (!term) return;

          const result = await this.plugin.urbanDictionaryService.lookup(term);

          const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();
          if (!channelId) return;

          modulesService.messageModule.sendMessage(channelId, {
            content: result,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        } catch (error) {
          this.logger.error(error);
        }
      },
    };

    // Urban Dictionary lookup command with detailed alert window
    this.urban2Command = {
      id: 'UrbanDictionary-Lookup-Detailed',
      untranslatedName: urban2Name,
      displayName: urban2Name,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: urban2Description,
      displayDescription: urban2Description,
      options: [
        {
          name: 'term',
          displayName: 'Term',
          description: 'The term to look up on Urban Dictionary',
          displayDescription: 'The term to look up on Urban Dictionary',
          required: true,
          type: 3, // STRING
        },
      ],
      execute: async (event) => {
        try {
          const term = event[0]?.value ?? '';
          if (!term) return;

          const response = await BdApi.Net.fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
          const data = await response.json();

          if (data.list.length === 0) {
            BdApi.alert("No Definition Found", `No definition found for "${term}" on Urban Dictionary.`);
            return;
          }

          // Sort definitions by thumbs up (most liked first)
          data.list.sort((a, b) => b.thumbs_up - a.thumbs_up);

          // Create a detailed definition display (text only, no HTML)
          const definitionTexts = data.list.slice(0, 4).map((definitionBlob, index) => {
            const definition = definitionBlob.definition.replace(/[\[\]]/g, "");
            const example = definitionBlob.example.replace(/[\[\]]/g, "");
            const likes = definitionBlob.thumbs_up.toString();
            const dislikes = definitionBlob.thumbs_down.toString();
            const author = definitionBlob.author;
            const date = new Date(definitionBlob.written_on).toLocaleString();

            return `
              Definition ${index + 1}:
              ${definition}

              Example:
              ${example}

              Likes: ${likes}, Dislikes: ${dislikes}, Author: ${author}, Date: ${date}
              ------------------------------------------
            `;
          });

          // Combine all definitions into a single string
          const alertContent = definitionTexts.join("\n");

          // Show the alert with detailed definitions (text only)
          BdApi.alert(`Urban Dictionary: ${term}`, alertContent);
        } catch (error) {
          this.logger.error('Error executing urban2 command:', error);
          BdApi.alert("Error", "An error occurred while looking up the term.");
        }
      },
    };

    // LMGTFY link generation command (unchanged)
    this.lmgtfyCommand = {
      id: 'Lmgtfy-Link',
      untranslatedName: lmgtfyName,
      displayName: lmgtfyName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: lmgtfyDescription,
      displayDescription: lmgtfyDescription,
      options: [
        {
          name: 'query',
          displayName: 'Query',
          description: 'The search query to generate the LMGTFY link for',
          displayDescription: 'The search query to generate the LMGTFY link for',
          required: true,
          type: 3, // STRING
        },
      ],
      execute: async (event) => {
        try {
          const query = event[0]?.value ?? '';
          if (!query) return;

          const result = this.plugin.lmgtfyService.generateLink(query);

          const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();
          if (!channelId) return;

          modulesService.messageModule.sendMessage(channelId, {
            content: result,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        } catch (error) {
          this.logger.error(error);
        }
      },
    };

    // Petpet Command (unchanged)
    this.petPetCommand = {
      id: 'PetPet-Generator',
      untranslatedName: petPetName,
      displayName: petPetName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: petPetDescription,
      displayDescription: petPetDescription,
      options: [
        {
          name: 'user',
          displayName: 'User',
          description: 'The user to generate the PetPet GIF for',
          displayDescription: 'The user to generate the PetPet GIF for',
          required: true,
          type: 6, // USER
        },
      ],
      execute: async (event) => {
        const { sendMessage } = BdApi.findModuleByProps('sendMessage');
        const { getUser } = BdApi.findModuleByProps('getUser');
        const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();

        const userId = event[0]?.value ?? '';
        if (!userId) return;

        const user = getUser(userId);
        if (!user) {
          sendMessage(channelId, { content: "User not found!" });
          return;
        }

        const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`;

        // Async function to handle fetch logic
        const generatePetPet = async () => {
          const response = await BdApi.Net.fetch(`https://gifstuffapi.com/petpet/?image=${encodeURIComponent(avatarUrl)}`);
          const result = await response.json();

          if (result.error || !result.url) {
            sendMessage(channelId, { content: "Failed to generate PetPet GIF." });
            return;
          }

          sendMessage(channelId, {
            content: `${result.url}`,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        };

        // Call the async function
        generatePetPet();
      },
    };

    // Swirl Command (new command)
    this.swirlCommand = {
      id: 'Swirl-Generator',
      untranslatedName: swirlName,
      displayName: swirlName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: swirlDescription,
      displayDescription: swirlDescription,
      options: [
        {
          name: 'user',
          displayName: 'User',
          description: 'The user to generate the Swirl GIF for',
          displayDescription: 'The user to generate the Swirl GIF for',
          required: true,
          type: 6, // USER
        },
      ],
      execute: async (event) => {
        const { sendMessage } = BdApi.findModuleByProps('sendMessage');
        const { getUser } = BdApi.findModuleByProps('getUser');
        const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();

        const userId = event[0]?.value ?? '';
        if (!userId) return;

        const user = getUser(userId);
        if (!user) {
          sendMessage(channelId, { content: "User not found!" });
          return;
        }

        const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`;

        // Async function to handle fetch logic
        const generateSwirl = async () => {
          const response = await BdApi.Net.fetch(`https://gifstuffapi.com/swirl/?image=${encodeURIComponent(avatarUrl)}`);
          const result = await response.json();

          if (result.error || !result.url) {
            sendMessage(channelId, { content: "Failed to generate Swirl GIF." });
            return;
          }

          sendMessage(channelId, {
            content: `${result.url}`,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        };

        // Call the async function
        generateSwirl();
      },
    };

    // Webster Dictionary lookup command (unchanged)
    this.defineCommand = {
      id: 'WebsterDictionary-Lookup',
      untranslatedName: defineName,
      displayName: defineName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: defineDescription,
      displayDescription: defineDescription,
      options: [
        {
          name: 'term',
          displayName: 'Term',
          description: 'The term to look up on Webster\'s Dictionary',
          displayDescription: 'The term to look up on Webster\'s Dictionary',
          required: true,
          type: 3, // STRING
        },
      ],
      execute: async (event) => {
        try {
          const term = event[0]?.value ?? '';
          if (!term) return;

          const result = await this.plugin.websterDictionaryService.lookup(term);

          const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();
          if (!channelId) return;

          modulesService.messageModule.sendMessage(channelId, {
            content: result,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        } catch (error) {
          this.logger.error(error);
        }
      },
    };

    // WHOIS command with ephemeral messages (unchanged)
    this.whoisCommand = {
      id: 'Whois-Lookup',
      untranslatedName: whoisName,
      displayName: whoisName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: whoisDescription,
      displayDescription: whoisDescription,
      options: [
        {
          name: 'ip',
          displayName: 'IP Address',
          description: 'The IP address to look up WHOIS information for',
          displayDescription: 'The IP address to look up WHOIS information for',
          required: true,
          type: 3, // STRING
        },
      ],
      execute: async (event) => {
        try {
          const ip = event[0]?.value ?? '';
          if (!ip || !Utils.isValidIPv4(ip)) {
            // Send an ephemeral message for invalid input
            BdApi.alert("Error", "Please provide a valid IPv4 address.");
            return;
          }

          const result = await this.plugin.whoisService.lookup(ip);

          // Send the result as an ephemeral message
          BdApi.alert("IP Info", result);
        } catch (error) {
          this.logger.error('Error executing whois command:', error);
          // Send an ephemeral error message
          BdApi.alert("Error", "an error has occurred");
        }
      },
    };

    // Rainbow command (post URL only) (unchanged)
    this.rainbowCommand = {
      id: 'Rainbow-Command',
      untranslatedName: rainbowName,
      displayName: rainbowName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: rainbowDescription,
      displayDescription: rainbowDescription,
      options: [],
      execute: async (event) => {
        try {
          const { sendMessage } = BdApi.findModuleByProps('sendMessage');
          const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();

          const videoUrl = 'https://tehurn.com/media/RainbowTroloload.webm'; // Replace with the desired URL

          // Post the video URL in the chat
          sendMessage(channelId, {
            content: videoUrl,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        } catch (error) {
          this.logger.error('Error executing rainbow command:', error);
          sendMessage(channelId, { content: 'An error occurred while executing the command.' });
        }
      },
    };

    // QR code command (updated to use gifstuffapi.com)
	this.qrCommand = {
		id: 'QRCode-Generator',
		untranslatedName: qrName,
		displayName: qrName,
		type: 1, // CHAT
		inputType: 0, // BUILT_IN
		applicationId: '-1', // BUILT_IN
		untranslatedDescription: qrDescription,
		displayDescription: qrDescription,
		options: [
			{
			name: 'url',
			displayName: 'URL',
			description: 'The URL to generate a QR code for',
			displayDescription: 'The URL to generate a QR code for',
			required: true,
			type: 3, // STRING
			},
		],
		execute: async (event) => {
			try {
			const url = event[0]?.value ?? '';
			if (!url) return;
		
			const qrCodeUrl = await this.plugin.qrCodeService.generateQRCode(url);
		
			if (!qrCodeUrl) {
				BdApi.alert("Error", "Failed to generate QR code.");
				return;
			}
		
			const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();
			if (!channelId) return;
		
			modulesService.messageModule.sendMessage(channelId, {
				content: qrCodeUrl, // Post the URL from the JSON response
				invalidEmojis: [],
				tts: false,
				validNonShortcutEmojis: [],
			});
			} catch (error) {
			this.logger.error('Error executing QR code command:', error);
			BdApi.alert("Error", "An error occurred while generating the QR code.");
			}
		},
		};

    // Pizza Command (new command)
    this.pizzaCommand = {
      id: 'Pizza-Generator',
      untranslatedName: pizzaName,
      displayName: pizzaName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: pizzaDescription,
      displayDescription: pizzaDescription,
      options: [
        {
          name: 'user',
          displayName: 'User',
          description: 'The user to generate the Pizza GIF for',
          displayDescription: 'The user to generate the Pizza GIF for',
          required: true,
          type: 6, // USER
        },
      ],
      execute: async (event) => {
        const { sendMessage } = BdApi.findModuleByProps('sendMessage');
        const { getUser } = BdApi.findModuleByProps('getUser');
        const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();

        const userId = event[0]?.value ?? '';
        if (!userId) return;

        const user = getUser(userId);
        if (!user) {
          sendMessage(channelId, { content: "User not found!" });
          return;
        }

        const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`;

        // Async function to handle fetch logic
        const generatePizza = async () => {
          const response = await BdApi.Net.fetch(`https://gifstuffapi.com/pizza/?image=${encodeURIComponent(avatarUrl)}`);
          const result = await response.json();

          if (result.error || !result.url) {
            sendMessage(channelId, { content: "Failed to generate Pizza GIF." });
            return;
          }

          sendMessage(channelId, {
            content: `${result.url}`,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        };

        // Call the async function
        generatePizza();
      },
    };

    // Money Command (new command)
    this.moneyCommand = {
      id: 'Money-Generator',
      untranslatedName: moneyName,
      displayName: moneyName,
      type: 1, // CHAT
      inputType: 0, // BUILT_IN
      applicationId: '-1', // BUILT_IN
      untranslatedDescription: moneyDescription,
      displayDescription: moneyDescription,
      options: [
        {
          name: 'user',
          displayName: 'User',
          description: 'The user to generate the Money GIF for',
          displayDescription: 'The user to generate the Money GIF for',
          required: true,
          type: 6, // USER
        },
      ],
      execute: async (event) => {
        const { sendMessage } = BdApi.findModuleByProps('sendMessage');
        const { getUser } = BdApi.findModuleByProps('getUser');
        const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();

        const userId = event[0]?.value ?? '';
        if (!userId) return;

        const user = getUser(userId);
        if (!user) {
          sendMessage(channelId, { content: "User not found!" });
          return;
        }

        const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`;

        // Async function to handle fetch logic
        const generateMoney = async () => {
          const response = await BdApi.Net.fetch(`https://gifstuffapi.com/money/?image=${encodeURIComponent(avatarUrl)}`);
          const result = await response.json();

          if (result.error || !result.url) {
            sendMessage(channelId, { content: "Failed to generate Money GIF." });
            return;
          }

          sendMessage(channelId, {
            content: `${result.url}`,
            invalidEmojis: [],
            tts: false,
            validNonShortcutEmojis: [],
          });
        };

        // Call the async function
        generateMoney();
      },
    };

  // Remind Command (new command)
  this.remindCommand = {
    id: 'Remind-Command',
    untranslatedName: remindName,
    displayName: remindName,
    type: 1, // CHAT
    inputType: 0, // BUILT_IN
    applicationId: '-1', // BUILT_IN
    untranslatedDescription: remindDescription,
    displayDescription: remindDescription,
    options: [
      {
        name: 'user',
        displayName: 'User',
        description: 'The user to remind',
        displayDescription: 'The user to remind',
        required: true,
        type: 6, // USER
      },
      {
        name: 'time',
        displayName: 'Time',
        description: 'The time to wait before reminding (e.g., 10m, 1h)',
        displayDescription: 'The time to wait before reminding (e.g., 10m, 1h)',
        required: true,
        type: 3, // STRING
      },
      {
        name: 'message',
        displayName: 'Message',
        description: 'The message to remind the user of',
        displayDescription: 'The message to remind the user of',
        required: true,
        type: 3, // STRING
      },
    ],
    execute: async (event) => {
      try {
        const { sendMessage } = BdApi.findModuleByProps('sendMessage');
        const { getUser } = BdApi.findModuleByProps('getUser');
        const channelId = event.channelId || modulesService.channelModule.getCurrentlySelectedChannelId();

        const userId = event[0]?.value ?? '';
        const time = event[1]?.value ?? '';
        const message = event[2]?.value ?? '';

        if (!userId || !time || !message) return;

        const user = getUser(userId);
        if (!user) {
          sendMessage(channelId, { content: "User not found!" });
          return;
        }

        // Parse the time input (e.g., 10m, 1h)
        const timeRegex = /^(\d+)([mh])$/;
        const match = time.match(timeRegex);

        if (!match) {
          sendMessage(channelId, { content: "Invalid time format. Use '10m' for minutes or '1h' for hours." });
          return;
        }

        const amount = parseInt(match[1]);
        const unit = match[2];

        let timeInMs;
        if (unit === 'm') {
          timeInMs = amount * 60 * 1000; // Convert minutes to milliseconds
        } else if (unit === 'h') {
          timeInMs = amount * 60 * 60 * 1000; // Convert hours to milliseconds
        } else {
          sendMessage(channelId, { content: "Invalid time unit. Use 'm' for minutes or 'h' for hours." });
          return;
        }

        // Set the reminder
        this.plugin.reminderService.setReminder(userId, timeInMs, message, channelId);

        sendMessage(channelId, {
          content: `Reminder set for <@${userId}> in ${amount}${unit}.`,
          invalidEmojis: [],
          tts: false,
          validNonShortcutEmojis: [],
        });
      } catch (error) {
        this.logger.error('Error executing remind command:', error);
        sendMessage(channelId, { content: 'An error occurred while setting the reminder.' });
      }
    },
  };

    this.bdApi.Patcher.after(
      modulesService.commandsModule.module,
      modulesService.commandsModule.key,
      (_, _2, result) => {
        if (!this.profilePicCommand || !this.urbanCommand || !this.urban2Command || !this.lmgtfyCommand || !this.petPetCommand || !this.swirlCommand || !this.defineCommand || !this.whoisCommand || !this.rainbowCommand || !this.qrCommand || !this.pizzaCommand || !this.moneyCommand || !this.remindCommand) {
          this.logger.error('One or more commands are undefined.');
          return;
        }

        result.push(this.profilePicCommand, this.urbanCommand, this.urban2Command, this.lmgtfyCommand, this.petPetCommand, this.swirlCommand, this.defineCommand, this.whoisCommand, this.rainbowCommand, this.qrCommand, this.pizzaCommand, this.moneyCommand, this.remindCommand); // Add remindCommand to the list
        //this.logger.log('Commands registered successfully:', result);
      }
    );

    return Promise.resolve();
  }

  stop() {
    this.profilePicCommand = undefined;
    this.urbanCommand = undefined;
    this.urban2Command = undefined;
    this.lmgtfyCommand = undefined;
    this.petPetCommand = undefined;
    this.swirlCommand = undefined;
    this.defineCommand = undefined;
    this.whoisCommand = undefined;
    this.rainbowCommand = undefined;
    this.qrCommand = undefined;
    this.pizzaCommand = undefined;
    this.moneyCommand = undefined;
    this.remindCommand = undefined; // New command
    this.bdApi.Patcher.unpatchAll();
  }
}

class CustomCommandsService extends BaseService {
  configFilePath = path.join(BdApi.Plugins.folder, 'CommandCenter.config.json');
  config = {
    prefix: "./",
    commands: {
      "hello": "Hello, world!",
      "rules": "**Server Rules:**\n1. **Be Respectful** - Treat everyone with respect. No harassment or hate speech.\n2. **No Spamming** - Avoid excessive messages or disruptive content.\n3. **Stay On Topic** - Keep discussions relevant to the channel.\n4. **Follow Discord TOS** - Ensure your actions align with Discord's Terms of Service.",
      "bye": "Goodbye, cruel world!",
      "triforce": "‌ ‌  ▲\n▲‌ ▲"
    }
  };

  loadConfig() {
    if (fs.existsSync(this.configFilePath)) {
      try {
        const data = fs.readFileSync(this.configFilePath, 'utf-8');
        const parsedData = JSON.parse(data);
        this.config = { ...this.config, ...parsedData };
      } catch (error) {
        BdApi.alert("Error", "Failed to load commands from file.");
      }
    } else {
      this.createDefaultConfig();
    }
  }

  createDefaultConfig() {
    try {
      const defaultConfig = {
        prefix: "./",
        commands: {
          "hello": "Hello, world!",
          "rules": "**Server Rules:**\n1. **Be Respectful** - Treat everyone with respect. No harassment or hate speech.\n2. **No Spamming** - Avoid excessive messages or disruptive content.\n3. **Stay On Topic** - Keep discussions relevant to the channel.\n4. **Follow Discord TOS** - Ensure your actions align with Discord's Terms of Service.",
          "bye": "Goodbye, cruel world!",
          "triforce": "‌ ‌  ▲\n▲‌ ▲"
        }
      };

      const data = JSON.stringify(defaultConfig, null, 2); // Pretty-print JSON
      fs.writeFileSync(this.configFilePath, data, 'utf-8');
      BdApi.alert("Custom Commands", "Default config file created. CustomCommands.config.json can be edited in a text editor as well. Have fun!");
    } catch (error) {
      BdApi.alert("Error", "Failed to create default config.");
    }
  }

  saveConfigPrefix() {
    try {
      const data = JSON.stringify(this.config, null, 2); // Pretty-print JSON
      fs.writeFileSync(this.configFilePath, data, 'utf-8');
      BdApi.alert("Success", "Prefix updated successfully!");
    } catch (error) {
      BdApi.alert("Error", "Failed to save commands.");
    }
  }

  saveConfigCommands() {
    try {
      const data = JSON.stringify(this.config, null, 2); // Pretty-print JSON
      fs.writeFileSync(this.configFilePath, data, 'utf-8');
      BdApi.alert("Success", "Commands saved successfully!");
    } catch (error) {
      BdApi.alert("Error", "Failed to save commands.");
    }
  }

  saveConfigDelete() {
    try {
      const data = JSON.stringify(this.config, null, 2); // Pretty-print JSON
      fs.writeFileSync(this.configFilePath, data, 'utf-8');
      BdApi.alert("Success", "Command deleted!");
    } catch (error) {
      BdApi.alert("Error", "Failed to save commands.");
    }
  }

  start() {
    BdApi.Patcher.before("CommandCenter", BdApi.findModuleByProps("sendMessage"), "sendMessage", (thisObject, [channelId, message]) => {
      // Check if the message starts with the command prefix
      if (!message.content.startsWith(this.config.prefix)) return;

      const command = message.content.split(" ")[0].slice(this.config.prefix.length); // Get the command without the prefix
      if (this.config.commands[command]) {
        const args = message.content.slice(command.length + this.config.prefix.length).trim(); // Get command arguments (if any)
        const replacement = this.config.commands[command];

        // Modify the message with the corresponding response
        const newMessage = typeof replacement === "function"
          ? replacement(args)
          : replacement;

        // Change the original message content to the new message
        message.content = newMessage;

        // Allow the modified message to be sent instead of the original one
        return [channelId, message]; // Return the modified message to be sent
      }
    });
  }

  stop() {
    BdApi.Patcher.unpatchAll("CommandCenter");
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "20px";
    panel.style.backgroundColor = "#2f3136"; // Dark background
    panel.style.borderRadius = "8px";
    panel.style.fontFamily = "Arial, sans-serif";

    // Prefix input
    const prefixContainer = document.createElement("div");
    prefixContainer.style.marginBottom = "20px";

    const prefixLabel = document.createElement("label");
    prefixLabel.textContent = "Command Prefix:";
    prefixLabel.style.display = "block";
    prefixLabel.style.marginBottom = "8px";
    prefixLabel.style.color = "#b9bbbe"; // Subtle text color
    prefixLabel.style.fontSize = "14px";
    prefixLabel.style.fontWeight = "500";

    const prefixInput = document.createElement("input");
    prefixInput.type = "text";
    prefixInput.value = this.config.prefix || "./";
    prefixInput.style.width = "90px";
    prefixInput.style.padding = "8px 12px";
    prefixInput.style.border = "1px solid #42454a";
    prefixInput.style.borderRadius = "6px";
    prefixInput.style.backgroundColor = "#202225";
    prefixInput.style.color = "#ffffff";
    prefixInput.style.fontSize = "14px";
    prefixInput.style.outline = "none";
    prefixInput.style.transition = "border-color 0.2s ease";

    prefixInput.addEventListener("focus", () => {
        prefixInput.style.borderColor = "#7289da";
    });

    prefixInput.addEventListener("blur", () => {
        prefixInput.style.borderColor = "#42454a";
    });

    // Save Prefix Button
    const savePrefixButton = document.createElement("button");
    savePrefixButton.textContent = "Save Prefix";
    savePrefixButton.style.marginLeft = "10px";
    savePrefixButton.style.padding = "8px 16px";
    savePrefixButton.style.backgroundColor = "#7289da";
    savePrefixButton.style.color = "#ffffff";
    savePrefixButton.style.border = "none";
    savePrefixButton.style.borderRadius = "6px";
    savePrefixButton.style.cursor = "pointer";
    savePrefixButton.style.fontSize = "14px";
    savePrefixButton.style.transition = "background-color 0.2s ease";

    savePrefixButton.addEventListener("mouseenter", () => {
        savePrefixButton.style.backgroundColor = "#677bc4";
    });

    savePrefixButton.addEventListener("mouseleave", () => {
        savePrefixButton.style.backgroundColor = "#7289da";
    });

    savePrefixButton.onclick = () => {
        this.config.prefix = prefixInput.value;
        this.saveConfigPrefix();
    };

    prefixContainer.appendChild(prefixLabel);
    prefixContainer.appendChild(prefixInput);
    prefixContainer.appendChild(savePrefixButton);
    panel.appendChild(prefixContainer);

    // Command list
    const inputs = Object.keys(this.config.commands).map((command, index) => {
        const container = document.createElement("div");
        container.style.marginBottom = "20px";
        container.style.position = "relative";

        // Add a grey separator line above each command (except the first one)
        if (index > -1) {
            const separator = document.createElement("hr");
            separator.style.border = "none";
            separator.style.width = "225px";
            separator.style.borderTop = "2px solid #42454a";
            separator.style.margin = "20px 0";
            panel.appendChild(separator);
        }

        const commandLabel = document.createElement("label");
        commandLabel.textContent = "Command:";
        commandLabel.style.display = "block";
        commandLabel.style.marginBottom = "8px";
        commandLabel.style.color = "#b9bbbe";
        commandLabel.style.fontSize = "14px";
        commandLabel.style.fontWeight = "500";

        const commandInputContainer = document.createElement("div");
        commandInputContainer.style.position = "relative";
        commandInputContainer.style.display = "inline-block";

        const commandInput = document.createElement("input");
        commandInput.type = "text";
        commandInput.value = command.replace(this.config.prefix, "");
        commandInput.style.width = "90px";
        commandInput.style.padding = "8px 12px";
        commandInput.style.border = "1px solid #42454a";
        commandInput.style.borderRadius = "6px";
        commandInput.style.backgroundColor = "#202225";
        commandInput.style.color = "#ffffff";
        commandInput.style.fontSize = "14px";
        commandInput.style.outline = "none";
        commandInput.style.transition = "border-color 0.2s ease";

        commandInput.addEventListener("focus", () => {
            commandInput.style.borderColor = "#7289da";
        });

        commandInput.addEventListener("blur", () => {
            commandInput.style.borderColor = "#42454a";
        });

        // Remove command button
        const removeButton = document.createElement("button");
        removeButton.textContent = "×";
        removeButton.style.position = "absolute";
        removeButton.style.right = "8px";
        removeButton.style.top = "50%";
        removeButton.style.transform = "translateY(-50%)";
        removeButton.style.width = "24px";
        removeButton.style.height = "24px";
        removeButton.style.padding = "0";
        removeButton.style.backgroundColor = "transparent";
        removeButton.style.color = "#e74c3c";
        removeButton.style.border = "none";
        removeButton.style.borderRadius = "50%";
        removeButton.style.cursor = "pointer";
        removeButton.style.fontSize = "18px";
        removeButton.style.fontWeight = "bold";
        removeButton.style.transition = "color 0.2s ease";

        removeButton.addEventListener("mouseenter", () => {
            removeButton.style.color = "#c0392b";
        });

        removeButton.addEventListener("mouseleave", () => {
            removeButton.style.color = "#e74c3c";
        });

        removeButton.onclick = () => {
            delete this.config.commands[command];
            panel.removeChild(container);
            this.saveConfigDelete();
        };

        commandInputContainer.appendChild(commandInput);
        commandInputContainer.appendChild(removeButton);

        const responseLabel = document.createElement("label");
        responseLabel.textContent = "Response:";
        responseLabel.style.display = "block";
        responseLabel.style.marginTop = "12px";
        responseLabel.style.marginBottom = "8px";
        responseLabel.style.color = "#b9bbbe";
        responseLabel.style.fontSize = "14px";
        responseLabel.style.fontWeight = "500";

        const responseInput = document.createElement("textarea");
        responseInput.value = this.config.commands[command] || "";
        responseInput.style.width = "200px";
        responseInput.style.height = "80px";
        responseInput.style.padding = "8px 12px";
        responseInput.style.border = "1px solid #42454a";
        responseInput.style.borderRadius = "6px";
        responseInput.style.backgroundColor = "#202225";
        responseInput.style.color = "#ffffff";
        responseInput.style.fontSize = "14px";
        responseInput.style.outline = "none";
        responseInput.style.resize = "none";
        responseInput.style.transition = "border-color 0.2s ease";

        responseInput.addEventListener("focus", () => {
            responseInput.style.borderColor = "#7289da";
        });

        responseInput.addEventListener("blur", () => {
            responseInput.style.borderColor = "#42454a";
        });

        // Handle tab navigation
        commandInput.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                responseInput.focus();
            }
        });

        responseInput.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                const nextInput = container.nextElementSibling?.querySelector('input[type="text"]');
                if (nextInput) {
                    nextInput.focus();
                } else {
                    prefixInput.focus();
                }
            }
        });

        container.appendChild(commandLabel);
        container.appendChild(commandInputContainer);
        container.appendChild(responseLabel);
        container.appendChild(responseInput);
        panel.appendChild(container);

        return { commandInput, responseInput };
    });

    // Add Command button
    const addCommandButton = document.createElement("button");
    addCommandButton.textContent = "Add Command";
    addCommandButton.style.marginTop = "20px";
    addCommandButton.style.padding = "8px 16px";
    addCommandButton.style.backgroundColor = "#7289da";
    addCommandButton.style.color = "#ffffff";
    addCommandButton.style.border = "none";
    addCommandButton.style.borderRadius = "6px";
    addCommandButton.style.cursor = "pointer";
    addCommandButton.style.fontSize = "14px";
    addCommandButton.style.transition = "background-color 0.2s ease";

    addCommandButton.addEventListener("mouseenter", () => {
        addCommandButton.style.backgroundColor = "#677bc4";
    });

    addCommandButton.addEventListener("mouseleave", () => {
        addCommandButton.style.backgroundColor = "#7289da";
    });

    addCommandButton.onclick = () => {
        const container = document.createElement("div");
        container.style.marginBottom = "20px";
        container.style.position = "relative";

        // Add a grey separator line above the new command
        const separator = document.createElement("hr");
        separator.style.border = "none";
        separator.style.borderTop = "1px solid #42454a";
        separator.style.margin = "20px 0";
        panel.appendChild(separator);

        const commandLabel = document.createElement("label");
        commandLabel.textContent = "New Command:";
        commandLabel.style.display = "block";
        commandLabel.style.marginBottom = "8px";
        commandLabel.style.color = "#b9bbbe";
        commandLabel.style.fontSize = "14px";
        commandLabel.style.fontWeight = "500";

        const commandInputContainer = document.createElement("div");
        commandInputContainer.style.position = "relative";
        commandInputContainer.style.display = "inline-block";

        const commandInput = document.createElement("input");
        commandInput.type = "text";
        commandInput.value = "";
        commandInput.style.width = "90px";
        commandInput.style.padding = "8px 12px";
        commandInput.style.border = "1px solid #42454a";
        commandInput.style.borderRadius = "6px";
        commandInput.style.backgroundColor = "#202225";
        commandInput.style.color = "#ffffff";
        commandInput.style.fontSize = "14px";
        commandInput.style.outline = "none";
        commandInput.style.transition = "border-color 0.2s ease";

        commandInput.addEventListener("focus", () => {
            commandInput.style.borderColor = "#7289da";
        });

        commandInput.addEventListener("blur", () => {
            commandInput.style.borderColor = "#42454a";
        });

        const removeButton = document.createElement("button");
        removeButton.textContent = "×";
        removeButton.style.position = "absolute";
        removeButton.style.right = "8px";
        removeButton.style.top = "50%";
        removeButton.style.transform = "translateY(-50%)";
        removeButton.style.width = "24px";
        removeButton.style.height = "24px";
        removeButton.style.padding = "0";
        removeButton.style.backgroundColor = "transparent";
        removeButton.style.color = "#e74c3c";
        removeButton.style.border = "none";
        removeButton.style.borderRadius = "50%";
        removeButton.style.cursor = "pointer";
        removeButton.style.fontSize = "18px";
        removeButton.style.fontWeight = "bold";
        removeButton.style.transition = "color 0.2s ease";

        removeButton.addEventListener("mouseenter", () => {
            removeButton.style.color = "#c0392b";
        });

        removeButton.addEventListener("mouseleave", () => {
            removeButton.style.color = "#e74c3c";
        });

        removeButton.onclick = () => {
            panel.removeChild(container);
        };

        commandInputContainer.appendChild(commandInput);
        commandInputContainer.appendChild(removeButton);

        const responseLabel = document.createElement("label");
        responseLabel.textContent = "Response:";
        responseLabel.style.display = "block";
        responseLabel.style.marginTop = "12px";
        responseLabel.style.marginBottom = "8px";
        responseLabel.style.color = "#b9bbbe";
        responseLabel.style.fontSize = "14px";
        responseLabel.style.fontWeight = "500";

        const responseInput = document.createElement("textarea");
        responseInput.value = "";
        responseInput.style.width = "200px";
        responseInput.style.height = "80px";
        responseInput.style.padding = "8px 12px";
        responseInput.style.border = "1px solid #42454a";
        responseInput.style.borderRadius = "6px";
        responseInput.style.backgroundColor = "#202225";
        responseInput.style.color = "#ffffff";
        responseInput.style.fontSize = "14px";
        responseInput.style.outline = "none";
        responseInput.style.resize = "none";
        responseInput.style.transition = "border-color 0.2s ease";

        responseInput.addEventListener("focus", () => {
            responseInput.style.borderColor = "#7289da";
        });

        responseInput.addEventListener("blur", () => {
            responseInput.style.borderColor = "#42454a";
        });

        // Handle tab navigation
        commandInput.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                responseInput.focus();
            }
        });

        responseInput.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                const nextInput = container.nextElementSibling?.querySelector('input[type="text"]');
                if (nextInput) {
                    nextInput.focus();
                } else {
                    prefixInput.focus();
                }
            }
        });

        container.appendChild(commandLabel);
        container.appendChild(commandInputContainer);
        container.appendChild(responseLabel);
        container.appendChild(responseInput);
        panel.appendChild(container);
    };

    panel.appendChild(addCommandButton);

    // Save Commands Button
    const saveCommandsButton = document.createElement("button");
    saveCommandsButton.textContent = "Save Commands";
    saveCommandsButton.style.marginLeft = "10px";
    saveCommandsButton.style.marginRight = "10px";
    saveCommandsButton.style.marginTop = "20px";
    saveCommandsButton.style.padding = "8px 16px";
    saveCommandsButton.style.backgroundColor = "#7289da";
    saveCommandsButton.style.color = "#ffffff";
    saveCommandsButton.style.border = "none";
    saveCommandsButton.style.borderRadius = "6px";
    saveCommandsButton.style.cursor = "pointer";
    saveCommandsButton.style.fontSize = "14px";
    saveCommandsButton.style.transition = "background-color 0.2s ease";

    saveCommandsButton.addEventListener("mouseenter", () => {
        saveCommandsButton.style.backgroundColor = "#677bc4";
    });

    saveCommandsButton.addEventListener("mouseleave", () => {
        saveCommandsButton.style.backgroundColor = "#7289da";
    });

    saveCommandsButton.onclick = () => {
        const newCommands = {};
        panel.querySelectorAll('div').forEach((container) => {
            const commandInput = container.querySelector('input[type="text"]');
            const responseInput = container.querySelector('textarea');
            if (commandInput && responseInput) {
                const command = commandInput.value.trim();
                const response = responseInput.value.trim();
                if (command && response) {
                    newCommands[command] = response;
                }
            }
        });
        this.config.commands = { ...newCommands };
        this.saveConfigCommands();
    };

    panel.appendChild(saveCommandsButton);

    return panel;
}
}

class CommandCenterPlugin {
  settingsService;
  modulesService;
  patchesService;
  urbanDictionaryService;
  lmgtfyService;
  petPetService;
  defineService;
  websterDictionaryService;
  whoisService;
  qrCodeService; // New QR code service
  reminderService; // New reminder service
  customCommandsService;

  meta;
  bdApi;
  logger;

  constructor(meta) {
    this.meta = meta;
    this.bdApi = new BdApi(this.meta.name);
    this.logger = this.bdApi.Logger;
  }

  start() {
    this.doStart().catch((error) => {
      this.logger.error(error);
    });
  }

  async doStart() {
    await this.startServicesAndPatches();
  }

  async startServicesAndPatches() {
    this.settingsService = new SettingsService(this);
    await this.settingsService.start();

    this.modulesService = new ModulesService(this);
    await this.modulesService.start();

    this.urbanDictionaryService = new UrbanDictionaryService(this);
    this.lmgtfyService = new LmgtfyService(this);
    this.websterDictionaryService = new WebsterDictionaryService(this);
    this.whoisService = new WhoisService(this);
    this.qrCodeService = new QRCodeService(this); // Initialize QR code service
    this.reminderService = new ReminderService(this); // Initialize reminder service
    this.customCommandsService = new CustomCommandsService(this);
    this.patchesService = new PatchesService(this);

    await this.patchesService.start(this.modulesService, this.settingsService);
    this.customCommandsService.loadConfig();
    this.customCommandsService.start();
  }

  stop() {
    this.patchesService?.stop();
    this.patchesService = undefined;

    this.modulesService?.stop();
    this.modulesService = undefined;

    this.settingsService?.stop();
    this.settingsService = undefined;

    this.customCommandsService?.stop();
    this.customCommandsService = undefined;
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "10px";
    panel.style.backgroundColor = "#2f3136"; // Dark background

    const customCommandsPanel = this.customCommandsService.getSettingsPanel();
    panel.appendChild(customCommandsPanel);

    return panel;
  }
}

module.exports = CommandCenterPlugin;
