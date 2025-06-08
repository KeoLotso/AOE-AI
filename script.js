const CLIENT_ID = '1380895640556408862';
const BOT_ID = '1380895640556408862';
const REDIRECT_URI = https://keolotso.github.io/;
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
    return localStorage.getItem('discord_access_token');
}

function setAccessToken(token) {
    localStorage.setItem('discord_access_token', token);
}

function removeAccessToken() {
    localStorage.removeItem('discord_access_token');
}

async function makeDiscordRequest(endpoint, method = 'GET', body = null) {
    const token = getAccessToken();
    if (!token) throw new Error('No access token');

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
    
    if (!response.ok) {
        if (response.status === 401) {
            removeAccessToken();
            showSection('login-section');
            throw new Error('Unauthorized');
        }
        throw new Error(`Discord API error: ${response.status}`);
    }

    return response.json();
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
    response_type: 'code',
    scope: 'identify guilds'
});
window.location.href = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

}

async function handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) return false;

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

        if (!tokenResponse.ok) {
            throw new Error('Failed to get access token');
        }

        const tokenData = await tokenResponse.json();
        setAccessToken(tokenData.access_token);

        window.history.replaceState({}, document.title, window.location.pathname);
        
        await loadUserData();
        return true;
    } catch (error) {
        console.error('OAuth callback error:', error);
        alert('Login failed. Please try again.');
        return false;
    } finally {
        hideLoading();
    }
}

async function loadUserData() {
    try {
        showLoading();
        
        currentUser = await makeDiscordRequest('/users/@me');
        userServers = await makeDiscordRequest('/users/@me/guilds');

        userServers = userServers.filter(guild => 
            (guild.permissions & 0x20) === 0x20
        );

        displayUserInfo();
        await loadServersWithBotStatus();
        showSection('main-section');
    } catch (error) {
        console.error('Failed to load user data:', error);
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
    const serversGrid = document.getElementById('servers-grid');
    serversGrid.innerHTML = '';

    for (const server of userServers) {
        const serverCard = createServerCard(server);
        serversGrid.appendChild(serverCard);
    }
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
            <span>Checking bot status...</span>
        </div>
    `;

    checkBotInServer(server.id).then(isInServer => {
        const statusElement = card.querySelector('.server-status');
        const indicator = statusElement.querySelector('.status-indicator');
        const text = statusElement.querySelector('span:last-child');

        if (isInServer) {
            indicator.className = 'status-indicator online';
            text.textContent = 'Bot is active';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = 'Bot not in server';
        }
    });

    return card;
}

async function checkBotInServer(serverId) {
    try {
        const members = await makeDiscordRequest(`/guilds/${serverId}/members`);
        return members.some(member => member.user.id === BOT_ID);
    } catch (error) {
        return false;
    }
}

async function openServerConfig(serverId) {
    currentServerId = serverId;
    const server = userServers.find(s => s.id === serverId);
    
    document.getElementById('config-server-name').textContent = server.name;
    
    const isInServer = await checkBotInServer(serverId);
    
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
            <span>Bot not in server</span>
            <button id="invite-bot" class="invite-btn">Invite Bot</button>
        `;
        settingsSection.style.display = 'none';
        
        document.getElementById('invite-bot').onclick = () => {
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=2048&scope=bot%20applications.commands&guild_id=${serverId}`;
            window.open(inviteUrl, '_blank');
        };
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
        const channels = await makeDiscordRequest(`/guilds/${serverId}/channels`);
        const textChannels = channels.filter(channel => 
            channel.type === 0 && 
            (channel.permissions & 0x800) !== 0
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

    if (await handleCallback()) {
        return;
    }

    const token = getAccessToken();
    if (token) {
        await loadUserData();
    } else {
        showSection('login-section');
    }
});
