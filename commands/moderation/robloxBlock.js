async function robloxAction(userId, action, cookie) {
    const url = `https://accountsettings.roblox.com/v1/users/${userId}/${action}`;
    const headers = { 
        'Cookie': `.ROBLOSECURITY=${cookie}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.roblox.com',
        'Referer': 'https://www.roblox.com/'
    };
    
    try {
        console.log(`\n[ROBLOX] Intentando ${action} al usuario ${userId}...`);
        // Añadimos un body vacío, Roblox a veces da error si mandas un POST sin cuerpo
        let res = await fetch(url, { method: 'POST', headers, body: "{}" }); 
        
        if (res.status === 403) {
            const csrf = res.headers.get('x-csrf-token');
            console.log(`[ROBLOX] Petición de seguridad 403. CSRF Token recibido: ${csrf ? 'Sí' : 'No'}`);
            if (csrf) {
                headers['X-CSRF-TOKEN'] = csrf;
                res = await fetch(url, { method: 'POST', headers, body: "{}" });
            }
        }
        
        console.log(`[ROBLOX] Respuesta final: Código ${res.status}`);
        
        if (!res.ok) {
            const text = await res.text();
            console.log(`[ROBLOX] MOTIVO DEL ERROR: ${text}\n`);
        }
        
        return res.ok;
    } catch (e) {
        console.error("[ROBLOX] Error de conexión:", e);
        return false;
    }
}
