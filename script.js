const CLIENT_ID = '1380895640556408862';
const BOT_ID = '1380895640556408862';
const REDIRECT_URI = 'https://keolotso.github.io/AOE-AI'; // Removed trailing slash
const SUPABASE_URL = 'https://apqeitnavsjwqrpruuqq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwcWVpdG5hdnNqd3FycHJ1dXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMDUzMzYsImV4cCI6MjA1OTY4MTMzNn0.G14iwTdC2qpCsRTw3-JcKTowx4yRWJPpObGGWIr65lQ';

let currentUser = null;
let userServers = [];
let currentServerId = null;

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');
}

function getAccessToken() {
    // Don't check URL params here - only check localStorage
    const token = localStorage.getItem('discord_access_token');
    console.log('Getting access token:', token ? 'Token found in localStorage' : 'No token in localStorage');
    return token;
}

function setAccessToken(token) {
    localStorage.setItem('discord_access_token', token);
}

function removeAccessToken() {
    localStorage.removeItem('discord_access_token');
}

async function makeDiscordRequest(endpoint, method = 'GET', body = null, skipErrorRedirect = false) {
    const token = getAccessToken();
    if (!token) {
        console.error('No access token available');
        throw new Error('No access token');
    }

    console.log(`Making Discord API request to: ${endpoint}`);

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`https://discord.com/api/v10${endpoint}`, options);
    
    console.log(`Response status for ${endpoint}:`, response.status);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Discord API error for ${endpoint}:`, response.status, errorText);
        
        // Only redirect to login for critical errors and when not skipping redirect
        if (response.status === 401 && !skipErrorRedirect) {
            console.log('Unauthorized - removing token');
            removeAccessToken();
            showSection('login-section');
            throw new Error('Unauthorized - token may be expired');
        }
        throw new Error(`Discord API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Successful response for ${endpoint}:`, data);
    return data;
}

async function makeSupabaseRequest(endpoint, method = 'GET', body = null, params = null) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${endpoint}`);
    
    if (params) {
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    }

    const options = {
        method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    return response.json();
}

async function login() {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'token',
        scope: 'identify guilds bot'
    });

    console.log('Redirecting to Discord OAuth with bot scope');
    window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
}

async function handleCallback() {
    // Check for access token in URL hash (implicit flow)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    
    // Check for authorization code in URL params (authorization code flow)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    console.log('Checking callback - Hash:', window.location.hash, 'Search:', window.location.search);
    console.log('Access token from hash:', accessToken ? 'Found' : 'Not found');
    console.log('Code from params:', code ? 'Found' : 'Not found');

    if (accessToken) {
        // Implicit flow - token directly in URL
        console.log('Using implicit flow token');
        setAccessToken(accessToken);
        window.history.replaceState({}, document.title, window.location.pathname);
        await loadUserData();
        return true;
    } else if (code) {
        // Authorization code flow
        console.log('Using authorization code flow');
        try {
            showLoading();
            
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: CLIENT_ID,
                    client_secret: 'cBn9ahP2cJtwJBQvoNSytV67qd-o43OX',
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: REDIRECT_URI
                })
            });

            console.log('Token exchange response status:', tokenResponse.status);

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                console.error('Token exchange failed:', errorText);
                throw new Error(`Failed to get access token: ${tokenResponse.status}`);
            }

            const tokenData = await tokenResponse.json();
            console.log('Token data received:', tokenData.access_token ? 'Token present' : 'No token');
            setAccessToken(tokenData.access_token);

            window.history.replaceState({}, document.title, window.location.pathname);
            
            await loadUserData();
            return true;
        } catch (error) {
            console.error('OAuth callback error:', error);
            alert('Login failed. Please try again. Check console for details.');
            return false;
        } finally {
            hideLoading();
        }
    }
    
    console.log('No callback parameters found');
    return false;
}

async function loadUserData() {
    try {
        showLoading();
        
        console.log('Loading user data with token:', getAccessToken() ? 'Token exists' : 'No token');
        
        currentUser = await makeDiscordRequest('/users/@me');
        console.log('User loaded:', currentUser.username);
        
        userServers = await makeDiscordRequest('/users/@me/guilds');
        console.log('Servers loaded:', userServers.length);

        userServers = userServers.filter(guild => 
            (guild.permissions & 0x20) === 0x20
        );
        console.log('Admin servers:', userServers.length);

        displayUserInfo();
        await loadServersWithBotStatus();
        showSection('main-section');
    } catch (error) {
        console.error('Failed to load user data:', error);
        console.error('Error details:', error.message);
        
        // Don't immediately redirect to login, let's see the error first
        alert(`Error loading data: ${error.message}. Check console for details.`);
        showSection('login-section');
    } finally {
        hideLoading();
    }
}

function displayUserInfo() {
    const avatarUrl = currentUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${currentUser.discriminator % 5}.png`;

    document.getElementById('user-avatar').src = avatarUrl;
    document.getElementById('user-name').textContent = currentUser.global_name || currentUser.username;
    document.getElementById('user-tag').textContent = `@${currentUser.username}`;
}

async function loadServersWithBotStatus() {
    console.log('Starting to load servers with bot status');
    const serversGrid = document.getElementById('servers-grid');
    serversGrid.innerHTML = '';

    for (const server of userServers) {
        console.log('Creating card for server:', server.name);
        const serverCard = createServerCard(server);
        serversGrid.appendChild(serverCard);
    }
    console.log('Finished loading server cards');
}

function createServerCard(server) {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.onclick = () => openServerConfig(server.id);

    const iconUrl = server.icon 
        ? `https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`
        : null;

    card.innerHTML = `
        <div class="server-header">
            <div class="server-icon">
                ${iconUrl ? `<img src="${iconUrl}" alt="${server.name}" style="width: 100%; height: 100%; border-radius: 50%;">` : server.name.charAt(0)}
            </div>
            <div class="server-name">${server.name}</div>
        </div>
        <div class="server-status">
            <span class="status-indicator offline"></span>
            <span>Bot status unknown</span>
        </div>
    `;

    // Check bot status with error handling that doesn't redirect
    setTimeout(async () => {
        try {
            console.log('Checking bot status for:', server.name);
            const isInServer = await checkBotInServerSimple(server.id);
            const statusElement = card.querySelector('.server-status');
            if (statusElement) {
                const indicator = statusElement.querySelector('.status-indicator');
                const text = statusElement.querySelector('span:last-child');

                if (isInServer) {
                    indicator.className = 'status-indicator online';
                    text.textContent = 'Bot is active';
                } else {
                    indicator.className = 'status-indicator offline';
                    text.textContent = 'Bot not in server';
                }
            }
        } catch (error) {
            console.error('Error checking bot status for', server.name, ':', error.message);
            // Don't update the UI if there's an error - leave it as "Bot status unknown"
        }
    }, Math.random() * 2000 + 1000); // Random delay between 1-3 seconds to avoid rate limiting

    return card;
}

async function checkBotInServer(serverId) {
    console.log('=== Checking bot status for server:', serverId, '===');
    
    try {
        // Method 1: Check Supabase database first (most reliable)
        console.log('Method 1: Checking database records...');
        try {
            const config = await makeSupabaseRequest('AOE DiscordBot', 'GET', null, {
                'serverID': `eq.${serverId}`,
                'select': 'serverID,lastActive'
            });
            
            if (config && config.length > 0) {
                console.log('✅ Bot configuration found in database');
                // If there's a recent lastActive timestamp, bot is likely active
                return true;
            }
        } catch (error) {
            console.log('Database check failed:', error.message);
        }

        // Method 2: Try to check if we can see any bot activity
        console.log('Method 2: Checking recent bot activity...');
        try {
            // Get recent messages from a channel to see bot activity
            const channels = await makeDiscordRequest(`/guilds/${serverId}/channels`, 'GET', null, true);
            const textChannels = channels.filter(ch => ch.type === 0);
            
            if (textChannels.length > 0) {
                // Check the first available channel for recent messages
                const messages = await makeDiscordRequest(`/channels/${textChannels[0].id}/messages?limit=50`, 'GET', null, true);
                const botMessages = messages.filter(msg => msg.author && msg.author.id === BOT_ID);
                
                if (botMessages.length > 0) {
                    console.log('✅ Found recent bot messages - bot is active');
                    return true;
                }
            }
        } catch (error) {
            console.log('Message check failed:', error.message);
        }

        // Method 3: Alternative - check if bot has slash commands registered
        console.log('Method 3: Checking application commands...');
        try {
            const commands = await makeDiscordRequest(`/applications/${CLIENT_ID}/guilds/${serverId}/commands`, 'GET', null, true);
            if (commands && commands.length > 0) {
                console.log('✅ Bot has registered slash commands - bot is present');
                return true;
            }
        } catch (error) {
            console.log('Commands check failed:', error.message);
        }

        // Method 4: Last resort - assume bot is present if user can manage it
        console.log('Method 4: Checking user permissions...');
        try {
            const guild = await makeDiscordRequest(`/guilds/${serverId}`, 'GET', null, true);
            if (guild && guild.owner_id) {
                console.log('ℹ️  User has guild access - cannot definitively confirm bot status');
                // Return true if database has config (bot was invited at some point)
                const hasConfig = await makeSupabaseRequest('AOE DiscordBot', 'GET', null, {
                    'serverID': `eq.${serverId}`
                });
                return hasConfig && hasConfig.length > 0;
            }
        } catch (error) {
            console.log('Guild check failed:', error.message);
        }

        console.log('❌ Bot not detected in server');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking bot status:', error);
        return false;
    }
}

async function checkUserBotPermissions(serverId) {
    try {
        // Check if the current user has administrator or manage server permissions
        const member = await makeDiscordRequest(`/guilds/${serverId}/members/@me`, 'GET', null, true);
        
        if (member && member.permissions) {
            const permissions = parseInt(member.permissions);
            const hasAdmin = (permissions & 0x8) === 0x8; // Administrator
            const hasManageGuild = (permissions & 0x20) === 0x20; // Manage Server
            
            console.log('User permissions in server:', {
                hasAdmin,
                hasManageGuild,
                rawPermissions: permissions.toString(16)
            });
            
            return hasAdmin || hasManageGuild;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking user permissions:', error);
        return false;
    }
}

async function openServerConfig(serverId) {
    currentServerId = serverId;
    const server = userServers.find(s => s.id === serverId);
    
    document.getElementById('config-server-name').textContent = server.name;
    
    try {
        // Use the simple check method
        const isConfigured = await checkBotInServerSimple(serverId);
        
        const botStatus = document.getElementById('bot-status');
        const settingsSection = document.getElementById('settings-section');
        
        if (isConfigured) {
            botStatus.innerHTML = `
                <span class="status-indicator online"></span>
                <span>Bot is configured for this server</span>
                <button id="refresh-status" class="invite-btn" style="margin-left: 10px; font-size: 12px;">Refresh</button>
            `;
            settingsSection.style.display = 'block';
            await loadServerConfig(serverId);
            await loadServerChannels(serverId);
            
            // Add refresh button functionality
            document.getElementById('refresh-status').onclick = () => {
                location.reload(); // Simple refresh
            };
        } else {
            botStatus.innerHTML = `
                <span class="status-indicator offline"></span>
                <span>Bot not configured</span>
                <button id="invite-bot" class="invite-btn">Invite Bot</button>
                <button id="mark-present" class="save-btn" style="margin-left: 10px; font-size: 12px;">Bot is Present</button>
            `;
            settingsSection.style.display = 'none';
            
            document.getElementById('invite-bot').onclick = () => {
                const permissions = 2048 + 32768 + 268435456; // Basic bot permissions
                const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands&guild_id=${serverId}`;
                window.open(inviteUrl, '_blank');
            };
            
            // Add "Bot is Present" button for manual confirmation
            document.getElementById('mark-present').onclick = async () => {
                try {
                    // Create a basic config entry to mark bot as present
                    await makeSupabaseRequest('AOE DiscordBot', 'POST', {
                        serverID: serverId,
                        whitelistedOnly: false,
                        whitelistedChannels: JSON.stringify([])
                    });
                    
                    alert('Bot marked as present! Refreshing...');
                    await openServerConfig(serverId); // Refresh the modal
                } catch (error) {
                    console.error('Error marking bot as present:', error);
                    alert('Error updating bot status');
                }
            };
        }
        
    } catch (error) {
        console.error('Error opening server config:', error);
        // Show error state
        const botStatus = document.getElementById('bot-status');
        botStatus.innerHTML = `
            <span class="status-indicator offline"></span>
            <span>Error checking bot status</span>
            <button id="invite-bot" class="invite-btn">Invite Bot</button>
        `;
        
        document.getElementById('invite-bot').onclick = () => {
            const permissions = 2048 + 32768 + 268435456;
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands&guild_id=${serverId}`;
            window.open(inviteUrl, '_blank');
        };
    }
    
    document.getElementById('server-config').classList.remove('hidden');
}

async function checkBotInServerHybrid(serverId) {
    console.log('=== Hybrid bot check for server:', serverId, '===');
    
    try {
        // Step 1: Check if bot config exists in database
        const config = await makeSupabaseRequest('AOE DiscordBot', 'GET', null, {
            'serverID': `eq.${serverId}`,
            'select': '*'
        });
        
        const hasConfig = config && config.length > 0;
        console.log('Has database config:', hasConfig);
        
        // Step 2: Try basic Discord API calls to see what works
        let canAccessGuild = false;
        try {
            const guild = await makeDiscordRequest(`/guilds/${serverId}`, 'GET', null, true);
            canAccessGuild = guild && guild.id === serverId;
            console.log('Can access guild details:', canAccessGuild);
        } catch (error) {
            console.log('Cannot access guild details');
        }
        
        // Step 3: Try to access channels
        let canAccessChannels = false;
        try {
            const channels = await makeDiscordRequest(`/guilds/${serverId}/channels`, 'GET', null, true);
            canAccessChannels = channels && channels.length > 0;
            console.log('Can access channels:', canAccessChannels);
        } catch (error) {
            console.log('Cannot access channels');
        }
        
        // Decision logic: If we have config AND can access guild data, assume bot is present
        const botLikelyPresent = hasConfig && (canAccessGuild || canAccessChannels);
        
        console.log('Final decision - Bot likely present:', botLikelyPresent);
        return botLikelyPresent;
        
    } catch (error) {
        console.error('Hybrid check failed:', error);
        return false;
    }
}
async function checkBotInServerSimple(serverId) {
    try {
        // Just check if bot has been configured for this server
        const config = await makeSupabaseRequest('AOE DiscordBot', 'GET', null, {
            'serverID': `eq.${serverId}`
        });
        
        const isConfigured = config && config.length > 0;
        console.log(`Bot configured for server ${serverId}:`, isConfigured);
        
        return isConfigured;
    } catch (error) {
        console.error('Error checking bot config:', error);
        return false;
    }
}

async function loadServerConfig(serverId) {
    try {
        const config = await makeSupabaseRequest('AOE DiscordBot', 'GET', null, {
            'serverID': `eq.${serverId}`,
            'select': 'serverID,whitelistedOnly,whitelistedChannels'
        });

        if (config && config.length > 0) {
            const serverConfig = config[0];
            document.getElementById('whitelist-toggle').checked = serverConfig.whitelistedOnly;
            
            const channelsSection = document.getElementById('channels-section');
            channelsSection.style.display = serverConfig.whitelistedOnly ? 'block' : 'none';
            
            if (serverConfig.whitelistedChannels) {
                try {
                    const whitelistedChannels = JSON.parse(serverConfig.whitelistedChannels);
                    updateChannelCheckboxes(whitelistedChannels);
                } catch (e) {
                    const channels = serverConfig.whitelistedChannels.split(',').map(ch => ch.trim()).filter(ch => ch);
                    updateChannelCheckboxes(channels);
                }
            }
        } else {
            document.getElementById('whitelist-toggle').checked = false;
            document.getElementById('channels-section').style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load server config:', error);
    }
}

async function loadServerChannels(serverId) {
    try {
        // Use skipErrorRedirect=true to prevent redirecting on permission errors
        const channels = await makeDiscordRequest(`/guilds/${serverId}/channels`, 'GET', null, true);
        const textChannels = channels.filter(channel => 
            channel.type === 0
        );

        const channelsList = document.getElementById('channels-list');
        channelsList.innerHTML = '';

        textChannels.forEach(channel => {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';
            channelItem.innerHTML = `
                <input type="checkbox" id="channel-${channel.id}" value="${channel.id}">
                <label for="channel-${channel.id}" class="channel-name"># ${channel.name}</label>
            `;
            channelsList.appendChild(channelItem);
        });
    } catch (error) {
        console.error('Failed to load server channels:', error);
        // Show an error message in the channels list
        const channelsList = document.getElementById('channels-list');
        channelsList.innerHTML = '<p style="color: #666;">Unable to load channels. You may need additional permissions.</p>';
    }
}

function updateChannelCheckboxes(whitelistedChannels) {
    whitelistedChannels.forEach(channelId => {
        const checkbox = document.getElementById(`channel-${channelId}`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

async function saveServerConfig() {
    try {
        showLoading();
        
        const whitelistedOnly = document.getElementById('whitelist-toggle').checked;
        const channelCheckboxes = document.querySelectorAll('#channels-list input[type="checkbox"]:checked');
        const whitelistedChannels = Array.from(channelCheckboxes).map(cb => cb.value);

        const configData = {
            serverID: currentServerId,
            whitelistedOnly: whitelistedOnly,
            whitelistedChannels: JSON.stringify(whitelistedChannels)
        };

        const existingConfig = await makeSupabaseRequest('AOE DiscordBot', 'GET', null, {
            'serverID': `eq.${currentServerId}`
        });

        if (existingConfig && existingConfig.length > 0) {
            await makeSupabaseRequest(`AOE DiscordBot?serverID=eq.${currentServerId}`, 'PATCH', configData);
        } else {
            await makeSupabaseRequest('AOE DiscordBot', 'POST', configData);
        }

        alert('Configuration saved successfully!');
        document.getElementById('server-config').classList.add('hidden');
        await loadServersWithBotStatus();
    } catch (error) {
        console.error('Failed to save config:', error);
        alert('Failed to save configuration. Please try again.');
    } finally {
        hideLoading();
    }
}

async function deleteServerConfig() {
    if (!confirm('Are you sure you want to remove bot settings for this server?')) {
        return;
    }

    try {
        showLoading();
        
        await makeSupabaseRequest(`AOE DiscordBot?serverID=eq.${currentServerId}`, 'DELETE');
        
        alert('Bot settings removed successfully!');
        document.getElementById('server-config').classList.add('hidden');
        await loadServersWithBotStatus();
    } catch (error) {
        console.error('Failed to delete config:', error);
        alert('Failed to remove bot settings. Please try again.');
    } finally {
        hideLoading();
    }
}

function logout() {
    removeAccessToken();
    currentUser = null;
    userServers = [];
    currentServerId = null;
    showSection('login-section');
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app');
    
    document.getElementById('discord-login').addEventListener('click', login);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('server-config').classList.add('hidden');
    });
    
    document.getElementById('whitelist-toggle').addEventListener('change', (e) => {
        const channelsSection = document.getElementById('channels-section');
        channelsSection.style.display = e.target.checked ? 'block' : 'none';
    });
    
    document.getElementById('save-config').addEventListener('click', saveServerConfig);
    document.getElementById('delete-config').addEventListener('click', deleteServerConfig);
    
    document.getElementById('server-config').addEventListener('click', (e) => {
        if (e.target.id === 'server-config') {
            document.getElementById('server-config').classList.add('hidden');
        }
    });

    console.log('Checking for callback...');
    if (await handleCallback()) {
        console.log('Callback handled successfully');
        return;
    }

    console.log('No callback, checking for existing token...');
    const token = getAccessToken();
    if (token) {
        console.log('Found existing token, loading user data');
        await loadUserData();
    } else {
        console.log('No token found, showing login');
        showSection('login-section');
    }
});
