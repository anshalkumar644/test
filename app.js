const { useState, useEffect, useRef } = React;

// --- Helper Functions ---
const Icon = ({ name, size = 24, className = "", onClick, ...props }) => <i onClick={onClick} {...props} className={`ph ph-${name} ${className}`} style={{ fontSize: size }}></i>;
const formatTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fileToBase64 = (f) => new Promise((r) => { const reader = new FileReader(); reader.onload = () => r(reader.result); reader.readAsDataURL(f); });

const getBotReply = (text) => {
    const lower = text.toLowerCase();
    if(lower.includes('hi') || lower.includes('hello')) return "Namaste! Main Eind Bot hu.";
    if(lower.includes('connect') || lower.includes('problem')) return "Agar connect nahi ho raha to upar 'Refresh' 🔄 button dabayein.";
    return "Main aapki help ke liye yahan hu. Aap video call ya chat kar sakte hain.";
};

// --- Video Player ---
const VideoPlayer = ({ stream, isLocal }) => {
    const videoRef = useRef(null);
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.muted = isLocal;
            if(!isLocal) videoRef.current.play().catch(e => console.log(e));
        }
    }, [stream, isLocal]);
    return <video ref={videoRef} autoPlay playsInline className={`w-full h-full ${isLocal?'object-cover':'object-contain'}`} style={{ transform: isLocal?'scaleX(-1)':'' }} />;
};

// --- Improved P2P Hook (Auto Reconnect & Multi-STUN) ---
const usePeer = (user, onData, onCall, onError) => {
    const [myPeerId, setMyPeerId] = useState(null);
    const [status, setStatus] = useState("Initializing...");
    const peerRef = useRef(null);
    const connRef = useRef({});

    useEffect(() => {
        if (!user) return;
        const cleanId = "eind-" + user.phone.replace(/\D/g, '');
        
        // FIX: Added multiple STUN servers for better connectivity across networks
        const p = new Peer(cleanId, { 
            debug: 1,
            config: {
                iceServers: [
                    { url: 'stun:stun.l.google.com:19302' },
                    { url: 'stun:stun1.l.google.com:19302' },
                    { url: 'stun:stun2.l.google.com:19302' },
                    { url: 'stun:stun3.l.google.com:19302' },
                    { url: 'stun:stun4.l.google.com:19302' }
                ]
            }
        });
        
        p.on('open', (id) => { setMyPeerId(id); setStatus("Online"); });
        
        p.on('connection', (c) => {
            c.on('open', () => {
                connRef.current[c.peer] = c;
                // Handshake sends user info immediately
                c.send({ type: 'handshake', user: { name: user.name, avatar: user.avatar, phone: user.phone } });
            });
            c.on('data', (d) => {
                if(d.type === 'handshake') onData(d, c.peer);
                else onData(d, c.peer);
            });
            c.on('close', () => { delete connRef.current[c.peer]; });
        });
        
        p.on('call', (c) => onCall && onCall(c));
        p.on('error', (e) => {
            if(e.type === 'peer-unavailable') { /* Ignore noisy errors */ }
            else if (onError) onError(e.type);
        });
        
        p.on('disconnected', () => { setStatus("Reconnecting..."); p.reconnect(); });

        peerRef.current = p;
        
        // Heartbeat to keep connection alive
        const interval = setInterval(() => {
            if(p && !p.destroyed) {
                Object.values(connRef.current).forEach(c => {
                    if(c.open) c.send({type:'ping'});
                });
            }
        }, 3000);

        return () => { p.destroy(); clearInterval(interval); };
    }, [user]);

    const connect = (id) => { 
        if(peerRef.current) {
            // Close existing to force fresh connection
            if(connRef.current[id]) { connRef.current[id].close(); delete connRef.current[id]; }
            
            const conn = peerRef.current.connect(id, { reliable: true });
            conn.on('open', () => {
                connRef.current[id] = conn;
                conn.send({ type: 'handshake', user: { name: user.name, avatar: user.avatar, phone: user.phone } });
            });
            conn.on('data', (d) => onData(d, id));
        }
    };

    const send = (id, msg) => { 
        const c = connRef.current[id]; 
        if(c && c.open) { 
            c.send(msg); 
            return true; 
        } 
        return false; 
    };
    
    const call = (id, s) => peerRef.current?.call(id, s);

    return { myPeerId, connect, send, call, status };
};

// --- Login Screen ---
const LoginScreen = ({ onLogin }) => {
    const [step, setStep] = useState(1);
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [avatar, setAvatar] = useState(null);
    const [inputOtp, setInputOtp] = useState("");
    const [generatedOtp, setGeneratedOtp] = useState(null);
    
    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if(file) setAvatar(await fileToBase64(file));
    };

    const handleSendOTP = () => {
        if(phone.length < 10 || !name) return alert("Naam aur Number zaruri hai.");
        const otp = Math.floor(1000 + Math.random() * 9000);
        setGeneratedOtp(otp);
        setStep(2);
    };

    const handleVerify = () => {
        if(parseInt(inputOtp) === generatedOtp) {
            onLogin({ phone, name, avatar });
        } else {
            alert("Galat OTP!");
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-gray-900 text-white p-4">
            <div className="bg-gray-800 p-6 rounded-xl w-full max-w-sm border border-gray-700 relative">
                <h2 className="text-xl font-bold text-center mb-1">Eind Login</h2>
                <p className="text-center text-xs text-gray-400 mb-6">Made in India 🇮🇳</p>
                
                {step === 1 ? (
                    <>
                        <div className="flex justify-center mb-4">
                            <label className="relative cursor-pointer">
                                {avatar ? <img src={avatar} className="w-20 h-20 rounded-full object-cover border-2 border-teal-500" /> : <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center border-2 border-dashed border-gray-500"><Icon name="camera" size={32}/></div>}
                                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                            </label>
                        </div>
                        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Apna Naam" className="w-full bg-gray-700 p-3 rounded mb-3 outline-none" />
                        <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Mobile Number" className="w-full bg-gray-700 p-3 rounded mb-4 outline-none" type="tel" />
                        <button onClick={handleSendOTP} className="w-full bg-teal-600 p-3 rounded font-bold hover:bg-teal-700 transition">OTP Bhejein</button>
                    </>
                ) : (
                    <div className="animate-pulse">
                        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900 p-3 rounded mb-4 shadow-md">
                            <p className="font-bold text-xs uppercase">Message</p>
                            <p className="text-sm">Aapka OTP hai: <span className="font-bold text-lg tracking-widest">{generatedOtp}</span></p>
                        </div>
                        <input value={inputOtp} onChange={e=>setInputOtp(e.target.value)} placeholder="OTP Yahan Daalein" className="w-full bg-gray-700 p-3 rounded mb-4 outline-none text-center text-xl tracking-widest" type="number" />
                        <button onClick={handleVerify} className="w-full bg-teal-600 p-3 rounded font-bold hover:bg-teal-700 transition">Verify & Login</button>
                        <button onClick={()=>setStep(1)} className="w-full mt-2 text-gray-400 text-sm">Cancel</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main App ---
const App = () => {
    const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('eind_user_v16')) || null);
    const [chats, setChats] = useState(() => JSON.parse(localStorage.getItem('eind_chats_v16')) || [
        { id: 'bot', name: 'Eind Bot', avatar: '🤖', lastMsg: 'Namaste! Help chahiye?', time: Date.now(), unread: 0, messages: [], type: 'dm' }
    ]);
    const [activeChat, setActiveChat] = useState(null);
    const [showQR, setShowQR] = useState(false);
    
    // New Modal States
    const [modalMode, setModalMode] = useState(null);
    const [inputVal, setInputVal] = useState(""); 
    const [groupMembers, setGroupMembers] = useState("");

    const [incomingCall, setIncomingCall] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    useEffect(() => { if(user) localStorage.setItem('eind_user_v16', JSON.stringify(user)); }, [user]);
    useEffect(() => { localStorage.setItem('eind_chats_v16', JSON.stringify(chats)); }, [chats]);

    const onData = (d, senderId) => {
        if (d.type === 'handshake') {
            setChats(prev => {
                if (prev.find(c => c.id === senderId)) return prev;
                return [{
                    id: senderId, name: d.user.name, avatar: d.user.avatar || '👤', phone: d.user.phone,
                    lastMsg: 'Connected!', time: Date.now(), unread: 0, isP2P: true, type: 'dm', messages: []
                }, ...prev];
            });
            return;
        }

        const isGroup = d.groupId ? true : false;
        const targetId = isGroup ? d.groupId : senderId;

        setChats(prev => {
            const idx = prev.findIndex(c => c.id === targetId);
            const msgContent = { id: Date.now(), type: d.type, content: d.content, sender: 'them', senderName: d.senderName, time: Date.now() };
            
            if(idx > -1) {
                const newChats = [...prev];
                newChats[idx].messages.push(msgContent);
                newChats[idx].lastMsg = d.type==='text' ? (isGroup?`${d.senderName}: ${d.text}`:d.text) : 'Media';
                newChats[idx].time = Date.now();
                if(activeChat !== targetId) newChats[idx].unread++;
                return newChats;
            }
            return prev;
        });
    };

    const onIncomingCall = (c) => setIncomingCall(c);
    const answerCall = async () => { try { const s = await navigator.mediaDevices.getUserMedia({video:true, audio:true}); setLocalStream(s); incomingCall.answer(s); setupCall(incomingCall); setIncomingCall(null); } catch(e) { alert("Camera Error"); } };
    const startCall = async (id, type) => { try { const s = await navigator.mediaDevices.getUserMedia({video:type==='video', audio:true}); setLocalStream(s); setupCall(peerControls.call(id, s)); } catch(e) { alert("Camera Error"); } };
    const setupCall = (c) => { setActiveCall(c); c.on('stream', s => setRemoteStream(s)); c.on('close', endCall); };
    const endCall = () => { activeCall?.close(); localStream?.getTracks().forEach(t=>t.stop()); setActiveCall(null); setIncomingCall(null); };

    const peerControls = usePeer(user, onData, onIncomingCall, (e)=>console.log(e));

    // Fix: Reconnect function
    const forceReconnect = (chatId) => {
        if(!chatId || chatId === 'bot') return;
        peerControls.connect(chatId);
        // Also connect to group members if group
        const chat = chats.find(c => c.id === chatId);
        if(chat && chat.type === 'group') {
            chat.members.forEach(m => peerControls.connect("eind-"+m.replace(/\D/g, '')));
        }
        alert("Reconnecting... 2 second wait karein.");
    };

    const handleSend = (txt, type='text', content=null) => {
        if(!activeChat) return;
        
        // Bot Logic
        if(activeChat === 'bot') {
            const newMsg = { id: Date.now(), type: 'text', content: txt, sender: 'me', time: Date.now() };
            setChats(prev => prev.map(c => c.id === 'bot' ? {...c, messages:[...c.messages, newMsg], lastMsg: txt, time: Date.now()} : c));
            setTimeout(() => {
                const reply = getBotReply(txt);
                const botMsg = { id: Date.now()+1, type: 'text', content: reply, sender: 'them', senderName:'Bot', time: Date.now() };
                setChats(prev => prev.map(c => c.id === 'bot' ? {...c, messages:[...c.messages, botMsg], lastMsg: reply, time: Date.now()} : c));
            }, 600);
            return;
        }

        const currentChat = chats.find(c => c.id === activeChat);
        const finalContent = content || txt;
        const newMsg = { id: Date.now(), type, content: finalContent, sender: 'me', time: Date.now() };
        
        // Optimistic UI Update
        setChats(prev => prev.map(c => c.id === activeChat ? {...c, messages:[...c.messages, newMsg], lastMsg: type==='text'?txt:'Media', time: Date.now()} : c));
        
        const payload = { type, content: finalContent, text: txt, senderName: user.name, groupId: currentChat.type==='group'?currentChat.id:null };

        // Send Logic with Retry
        if(currentChat.type === 'dm') {
            const sent = peerControls.send(activeChat, payload);
            if(!sent) {
                console.log("Send failed, attempting reconnect...");
                peerControls.connect(activeChat); // Auto-reconnect try
                setTimeout(() => peerControls.send(activeChat, payload), 1500); // Retry after 1.5s
            }
        } else {
            currentChat.members.forEach(phone => {
                const pid = "eind-" + phone.replace(/\D/g, '');
                if(pid !== peerControls.myPeerId) {
                    if(!peerControls.send(pid, payload)) {
                        peerControls.connect(pid);
                        setTimeout(() => peerControls.send(pid, payload), 1500);
                    }
                }
            });
        }
    };

    const handleAdd = () => {
        if(modalMode === 'friend') {
            if(!inputVal || inputVal.length < 10) return alert("Sahi number daalein");
            const fid = "eind-" + inputVal.replace(/\D/g, '');
            if(chats.find(c => c.id === fid)) return alert("Already added");
            setChats(prev => [{ id: fid, name: `User ${inputVal.slice(-4)}`, avatar: '👤', phone: inputVal, type: 'dm', lastMsg: 'Tap to chat', time: Date.now(), unread: 0, isP2P: true, messages: [] }, ...prev]);
            peerControls.connect(fid);
        } else {
            if(!inputVal) return alert("Group Name daalein");
            const members = groupMembers.split(',').map(s=>s.trim()).filter(s=>s.length>=10);
            if(members.length === 0) return alert("Members ke number daalein");
            const gid = "group-" + Date.now();
            setChats(prev => [{ id: gid, name: inputVal, avatar: '👥', type: 'group', members: members, lastMsg: 'Group created', time: Date.now(), unread: 0, messages: [] }, ...prev]);
            members.forEach(m => peerControls.connect("eind-" + m.replace(/\D/g, '')));
        }
        setModalMode(null); setInputVal(""); setGroupMembers("");
    };

    if (!user) return <LoginScreen onLogin={setUser} />;

    return (
        <div className="flex h-full w-full bg-app-dark relative text-gray-100">
            {incomingCall && <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center"><div className="bg-app-panel p-6 rounded-xl flex flex-col items-center"><h2 className="text-xl mb-4">Incoming Call...</h2><div className="flex gap-4"><button onClick={()=>setIncomingCall(null)} className="bg-red-500 p-4 rounded-full"><Icon name="phone-slash"/></button><button onClick={answerCall} className="bg-green-500 p-4 rounded-full"><Icon name="phone"/></button></div></div></div>}
            {activeCall && <div className="fixed inset-0 bg-black z-[70] flex flex-col"><div className="flex-1 relative flex items-center justify-center">{remoteStream?<VideoPlayer stream={remoteStream} isLocal={false}/>:<div className="animate-pulse">Connecting...</div>}<div className="absolute bottom-4 right-4 w-28 h-40 bg-gray-800 rounded border border-gray-600"><VideoPlayer stream={localStream} isLocal={true}/></div></div><div className="h-20 flex items-center justify-center bg-gray-900 pb-safe"><button onClick={endCall} className="bg-red-600 p-4 rounded-full"><Icon name="phone-slash"/></button></div></div>}
            
            {modalMode && <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                <div className="bg-app-panel p-6 rounded-xl w-full max-w-sm relative">
                    <button onClick={()=>setModalMode(null)} className="absolute top-3 right-3"><Icon name="x"/></button>
                    <h3 className="text-lg font-bold mb-4">{modalMode==='friend'?'Add Friend':'Create Group'}</h3>
                    <input value={inputVal} onChange={e=>setInputVal(e.target.value)} placeholder={modalMode==='friend'?"Mobile Number":"Group Name"} className="w-full bg-gray-700 p-2 rounded mb-2"/>
                    {modalMode==='group' && <textarea value={groupMembers} onChange={e=>setGroupMembers(e.target.value)} placeholder="Members Phone (comma se alag karein: 98.., 87..)" className="w-full bg-gray-700 p-2 rounded mb-2 h-20"/>}
                    <button onClick={handleAdd} className="w-full bg-teal-600 p-2 rounded font-bold">Done</button>
                </div>
            </div>}

            <div className={`${activeChat?'hidden md:flex':'flex'} w-full md:w-[400px] flex-col border-r border-gray-700 bg-app-dark h-full z-10`}>
                <div className="h-16 bg-app-panel flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2">
                        {user.avatar ? <img src={user.avatar} className="w-10 h-10 rounded-full object-cover"/> : <Icon name="user-circle" size={40}/>}
                        <div>
                            <span className="font-bold truncate max-w-[100px] block">{user.name}</span>
                            <span className={`text-[10px] ${peerControls.status==='Online'?'text-green-400':'text-red-400'}`}>{peerControls.status}</span>
                        </div>
                    </div>
                    <div className="flex gap-3 text-gray-400">
                        <button onClick={()=>setModalMode('group')}><Icon name="users-three" size={24}/></button>
                        <button onClick={()=>setModalMode('friend')}><Icon name="user-plus" size={24}/></button>
                        <button onClick={()=>setShowQR(true)}><Icon name="qr-code" size={24}/></button>
                        <button onClick={()=>{if(confirm('Logout?')) {localStorage.removeItem('eind_user_v15'); setUser(null);}}}><Icon name="sign-out" size={24}/></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">{chats.map(c=><div key={c.id} onClick={()=>setActiveChat(c.id)} className="flex items-center p-3 hover:bg-app-panel cursor-pointer"><div className="w-12 h-12 rounded-full bg-gray-600 mr-3 overflow-hidden shrink-0">{c.avatar?.length>50?<img src={c.avatar} className="w-full h-full object-cover"/>:<div className="flex items-center justify-center h-full text-2xl">{c.avatar}</div>}</div><div className="flex-1 border-b border-gray-800 pb-3 min-w-0"><div className="flex justify-between"><span className="font-bold truncate">{c.name}</span><span className="text-xs text-gray-500">{formatTime(c.time)}</span></div><div className="text-sm text-gray-400 truncate">{c.lastMsg}</div></div></div>)}</div>
                <div className="p-2 text-center text-[10px] text-gray-600 border-t border-gray-800 shrink-0 pb-safe">Created by Anshal Kumar • Made in India 🇮🇳</div>
            </div>

            {activeChat ? <ChatWindow chat={chats.find(c=>c.id===activeChat)} onBack={()=>setActiveChat(null)} onSend={handleSend} onCall={startCall} onReconnect={()=>forceReconnect(activeChat)} /> : 
            <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-app-panel border-b-4 border-app-teal">
                <div className="text-center">
                    <h1 className="text-6xl font-light">Eind</h1>
                    <p className="text-gray-400 mt-2">Connecting India 🇮🇳</p>
                    <div className="mt-6 inline-block px-4 py-2 bg-gray-800 rounded-full border border-gray-700">
                        <p className="text-xs text-gray-400">Created by <span className="text-teal-400 font-bold">Anshal Kumar</span></p>
                    </div>
                </div>
            </div>}

            {showQR && <QRModal id={"eind-"+user.phone} onClose={()=>setShowQR(false)} onScan={peerControls.connect} />}
        </div>
    );
};

const ChatWindow = ({ chat, onBack, onSend, onCall, onReconnect }) => {
    const [txt, setTxt] = useState("");
    const [isRec, setIsRec] = useState(false);
    const endRef = useRef(null);
    const mediaRef = useRef(null);
    const chunks = useRef([]);

    useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [chat.messages]);

    const startRec = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRef.current = new MediaRecorder(s);
            chunks.current = [];
            mediaRef.current.ondataavailable = e => chunks.current.push(e.data);
            mediaRef.current.onstop = () => {
                const r = new FileReader();
                r.readAsDataURL(new Blob(chunks.current, { type: 'audio/webm' }));
                r.onloadend = () => onSend("Voice", "voice", r.result);
            };
            mediaRef.current.start();
            setIsRec(true);
        } catch { alert("Mic Permission Denied"); }
    };

    const stopRec = () => { if(mediaRef.current && isRec) { mediaRef.current.stop(); setIsRec(false); } };
    const handleFile = async (e) => { const f = e.target.files[0]; if(f) onSend(f.name, f.type.startsWith('image')?'image':'video', await fileToBase64(f)); };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] relative w-full overflow-hidden">
            <div className="absolute inset-0 chat-bg"></div>
            <div className="h-16 bg-app-panel flex items-center px-4 shrink-0 z-20 border-l border-gray-700 shadow w-full justify-between">
                <div className="flex items-center overflow-hidden">
                    <button onClick={onBack} className="md:hidden mr-2"><Icon name="arrow-left"/></button>
                    <div className="w-10 h-10 rounded-full bg-gray-600 mr-3 shrink-0 overflow-hidden">{chat.avatar?.length>50?<img src={chat.avatar} className="w-full h-full object-cover"/>:<div className="flex items-center justify-center h-full text-xl">{chat.avatar}</div>}</div>
                    <div className="flex flex-col"><span className="font-bold truncate">{chat.name}</span><span className="text-xs text-gray-400">{chat.type==='group'?'Group':chat.phone}</span></div>
                </div>
                <div className="flex gap-4 text-app-teal">
                    {/* RECONNECT BUTTON */}
                    {chat.isP2P && <button onClick={onReconnect} title="Force Reconnect"><Icon name="arrows-clockwise" size={24} weight="bold"/></button>}
                    {chat.isP2P && <><button onClick={()=>onCall(chat.id, 'video')}><Icon name="video-camera" size={24} weight="fill"/></button><button onClick={()=>onCall(chat.id, 'audio')}><Icon name="phone" size={24} weight="fill"/></button></>}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 z-10 flex flex-col gap-2">
                {chat.messages.map(m => (
                    <div key={m.id} className={`max-w-[80%] p-2 rounded-lg ${m.sender==='me'?'self-end bg-message-out':'self-start bg-message-in'}`}>
                        {chat.type==='group' && m.sender!=='me' && <p className="text-xs text-yellow-500 font-bold mb-1">{m.senderName}</p>}
                        {m.type==='text' && <p className="text-sm">{m.content}</p>}
                        {m.type==='image' && <img src={m.content} className="rounded max-w-full"/>}
                        {m.type==='video' && <video src={m.content} controls className="rounded max-w-full"/>}
                        {m.type==='voice' && <audio src={m.content} controls className="h-8 w-48"/>}
                        <span className="text-[10px] text-gray-300 block text-right mt-1">{formatTime(m.time)}</span>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <div className="min-h-[60px] bg-app-panel px-4 py-2 flex items-center gap-3 z-20 shrink-0 pb-safe">
                <label className="text-gray-400 p-2"><Icon name="plus"/><input type="file" className="hidden" onChange={handleFile}/></label>
                <input value={txt} onChange={e=>setTxt(e.target.value)} placeholder="Message..." className="flex-1 bg-[#2a3942] rounded-lg px-4 py-2 outline-none text-sm"/>
                {txt ? 
                    <button onClick={()=>{onSend(txt);setTxt('')}} className="text-app-teal"><Icon name="paper-plane-right" size={24} weight="fill"/></button> : 
                    <button onMouseDown={startRec} onMouseUp={stopRec} onTouchStart={startRec} onTouchEnd={stopRec} className={`p-2 rounded-full ${isRec?'bg-red-500 text-white recording-pulse':'text-gray-400'}`}><Icon name="microphone" size={24} weight="fill"/></button>
                }
            </div>
        </div>
    );
};

const QRModal = ({ id, onClose, onScan }) => {
    const [tab, setTab] = useState(0);
    const [val, setVal] = useState('');
    const ref = useRef(null);
    useEffect(() => { if(tab===0 && ref.current && id) { ref.current.innerHTML=''; new QRCode(ref.current, {text:id, width:180, height:180, colorDark:"#111b21", colorLight:"#fff"}); } }, [tab, id]);
    useEffect(() => { if(tab===1) { const s = new Html5Qrcode("reader"); s.start({facingMode:"environment"}, {fps:10, qrbox:250}, (t)=>{s.stop(); onScan(t);}, ()=>{}).catch(()=>{}); return ()=>s.isScanning&&s.stop(); } }, [tab]);
    return (
        <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-sm p-5 relative text-gray-800">
                <button onClick={onClose} className="absolute top-3 right-3"><Icon name="x" size={24}/></button>
                <div className="flex bg-gray-100 p-1 rounded-lg mb-4"><button onClick={()=>setTab(0)} className={`flex-1 py-1 rounded ${tab===0?'bg-white shadow text-teal-600':''}`}>My Code</button><button onClick={()=>setTab(1)} className={`flex-1 py-1 rounded ${tab===1?'bg-white shadow text-teal-600':''}`}>Scan</button></div>
                <div className="h-[250px] flex flex-col items-center justify-center">
                    {tab===0 ? <><div ref={ref} className="border p-2 rounded"></div><div className="mt-2 bg-gray-100 px-2 py-1 rounded font-mono text-sm break-all w-full text-center">{id || "Loading..."}</div></> : 
                    <><div id="reader" className="w-full h-full bg-black rounded overflow-hidden mb-2"></div><div className="flex w-full gap-2"><input value={val} onChange={e=>setVal(e.target.value)} placeholder="Paste ID (eind-98...)" className="flex-1 border p-1 rounded"/><button onClick={()=>onScan(val)} className="bg-teal-600 text-white px-3 rounded">Go</button></div></>}
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
