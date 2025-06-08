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
        response_type: 'token', // Use implicit flow only
        scope: 'identify guilds'
    });

    console.log('Redirecting to Discord OAuth with implicit flow');
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
            const isInServer = await checkBotInServer(server.id);
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
    console.log('=== Starting bot status check for server:', serverId, '===');
    
    try {
        // Method 1: Check if bot is in guild members (most reliable)
        console.log('Method 1: Checking guild members...');
        try {
            const members = await makeDiscordRequest(`/guilds/${serverId}/members?limit=1000`, 'GET', null, true);
            console.log(`Found ${members.length} members in guild`);
            
            const botMember = members.find(member => member.user && member.user.id === BOT_ID);
            if (botMember) {
                console.log('✅ Bot found in guild members list');
                return true;
            } else {
                console.log('❌ Bot not found in guild members list');
            }
        } catch (error) {
            console.log('Method 1 failed:', error.message);
        }

        // Method 2: Direct member lookup
        console.log('Method 2: Direct member lookup...');
        try {
            const botMember = await makeDiscordRequest(`/guilds/${serverId}/members/${BOT_ID}`, 'GET', null, true);
            if (botMember && botMember.user && botMember.user.id === BOT_ID) {
                console.log('✅ Bot found via direct member lookup');
                return true;
            }
        } catch (error) {
            console.log('Method 2 failed:', error.message);
            if (error.message.includes('404')) {
                console.log('404 error means bot is definitely not in server');
            }
        }

        // Method 3: Check bot's guilds (requires bot token - this won't work with user token)
        console.log('Method 3: Checking via Supabase database...');
        try {
            const config = await makeSupabaseRequest('AOE DiscordBot', 'GET', null, {
                'serverID': `eq.${serverId}`,
                'select': 'serverID'
            });
            if (config && config.length > 0) {
                console.log('✅ Bot config found in database - bot was in server at some point');
                // Note: This doesn't guarantee the bot is still in the server
                console.log('⚠️  Database entry exists but bot might have been removed');
            }
        } catch (error) {
            console.log('Method 3 failed:', error.message);
        }

        // Method 4: Try to get detailed guild info (requires bot to be in server)
        console.log('Method 4: Checking guild accessibility...');
        try {
            const guild = await makeDiscordRequest(`/guilds/${serverId}`, 'GET', null, true);
            console.log('Guild info accessible:', guild.name);
            // If we can get guild info, the bot (or user) has access
            // But this doesn't specifically confirm the bot is there
        } catch (error) {
            console.log('Method 4 failed:', error.message);
        }

        console.log('❌ Bot not detected in server', serverId);
        return false;
        
    } catch (error) {
        console.error('❌ Critical error in bot status check:', error);
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
    
    console.log('=== Opening server config for:', server.name, '===');
    
    try {
        showLoading();
        
        // First check if user has permissions
        const hasPermissions = await checkUserBotPermissions(serverId);
        console.log('User has bot management permissions:', hasPermissions);
        
        // Check bot status
        const isInServer = await checkBotInServer(serverId);
        console.log('Bot in server result:', isInServer);
        
        const botStatus = document.getElementById('bot-status');
        const settingsSection = document.getElementById('settings-section');
        
        if (isInServer) {
            botStatus.innerHTML = `
                <span class="status-indicator online"></span>
                <span>Bot is active in this server</span>
            `;
            settingsSection.style.display = 'block';
            await loadServerConfig(serverId);
            await loadServerChannels(serverId);
        } else {
            botStatus.innerHTML = `
                <span class="status-indicator offline"></span>
                <span>Bot not detected in server</span>
                <button id="invite-bot" class="invite-btn">Invite Bot</button>
                <button id="refresh-status" class="invite-btn" style="margin-left: 10px;">Refresh Status</button>
            `;
            settingsSection.style.display = 'none';
            
            // Add event listeners for buttons
            document.getElementById('invite-bot').onclick = () => {
                const permissions = 2048 + 32768 + 268435456; // Send Messages + Use Slash Commands + Use External Emojis
                const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands&guild_id=${serverId}`;
                console.log('Opening invite URL:', inviteUrl);
                window.open(inviteUrl, '_blank');
            };
            
            document.getElementById('refresh-status').onclick = async () => {
                console.log('Refreshing bot status...');
                await openServerConfig(serverId); // Recursively call to refresh
            };
        }
        
    } catch (error) {
        console.error('Error in openServerConfig:', error);
        
        const botStatus = document.getElementById('bot-status');
        const settingsSection = document.getElementById('settings-section');
        
        botStatus.innerHTML = `
            <span class="status-indicator offline"></span>
            <span>Error checking bot status: ${error.message}</span>
            <button id="invite-bot" class="invite-btn">Invite Bot Anyway</button>
        `;
        settingsSection.style.display = 'none';
        
        document.getElementById('invite-bot').onclick = () => {
            const permissions = 2048 + 32768 + 268435456;
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands&guild_id=${serverId}`;
            window.open(inviteUrl, '_blank');
        };
    } finally {
        hideLoading();
    }
    
    document.getElementById('server-config').classList.remove('hidden');
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
