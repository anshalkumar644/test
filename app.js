const { useState, useEffect, useRef } = React;

// --- Helper Functions ---
const Icon = ({ name, size = 24, className = "", onClick }) => <i onClick={onClick} className={`ph ph-${name} ${className}`} style={{ fontSize: size }}></i>;
const formatTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fileToBase64 = (f) => new Promise((r) => { const reader = new FileReader(); reader.onload = () => r(reader.result); reader.readAsDataURL(f); });

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

// --- Login Screen with Profile Setup ---
const LoginScreen = ({ onLogin }) => {
    const [step, setStep] = useState(1);
    const [phone, setPhone] = useState("");
    const [name, setName] = useState("");
    const [avatar, setAvatar] = useState(null); // Base64 image
    const [inputOtp, setInputOtp] = useState("");
    const [generatedOtp, setGeneratedOtp] = useState(null);

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if(file) {
            if(file.size > 500000) return alert("Photo size 500KB se kam rakhein.");
            const base64 = await fileToBase64(file);
            setAvatar(base64);
        }
    };

    const handleGenerateOTP = () => {
        if (phone.length < 10) return alert("Sahi mobile number daalein");
        if (!name.trim()) return alert("Apna naam likhein");
        
        const newOtp = Math.floor(1000 + Math.random() * 9000);
        setGeneratedOtp(newOtp);
        setStep(2);
    };

    const handleVerify = () => {
        if (parseInt(inputOtp) === generatedOtp) {
            // Save User with Profile
            onLogin({ phone, name, avatar });
        } else {
            alert("Galat OTP!");
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white p-4">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700 relative overflow-hidden">
                <div className="flex justify-center mb-4">
                    <label className="relative cursor-pointer">
                        {avatar ? 
                            <img src={avatar} className="w-24 h-24 rounded-full object-cover border-4 border-teal-600" /> :
                            <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center border-4 border-gray-600 hover:border-teal-500 transition"><Icon name="camera-plus" size={32} /></div>
                        }
                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                    </label>
                </div>
                <h2 className="text-xl font-bold text-center mb-1">Profile Setup</h2>
                <p className="text-gray-400 text-center text-xs mb-6">Apna naam aur photo set karein</p>

                {step === 1 ? (
                    <>
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aapka Naam" className="w-full bg-gray-700 border border-gray-600 p-3 rounded mb-3 focus:border-teal-500 outline-none text-white" />
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile Number (ex: 9876543210)" className="w-full bg-gray-700 border border-gray-600 p-3 rounded mb-4 focus:border-teal-500 outline-none text-white" type="tel" />
                        <button onClick={handleGenerateOTP} className="w-full bg-teal-600 hover:bg-teal-700 py-3 rounded font-bold transition">OTP Bhejein</button>
                    </>
                ) : (
                    <div className="animate-fade-in">
                        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-900 p-3 rounded mb-4 shadow-md">
                            <p className="font-bold text-xs uppercase">Eind Message</p>
                            <p className="text-sm">Aapka OTP hai: <span className="font-bold text-lg tracking-widest">{generatedOtp}</span></p>
                        </div>
                        <input value={inputOtp} onChange={(e) => setInputOtp(e.target.value)} placeholder="OTP Daalein" className="w-full bg-gray-700 border border-gray-600 p-3 rounded mb-4 focus:border-teal-500 outline-none text-center text-xl tracking-widest" type="number" />
                        <button onClick={handleVerify} className="w-full bg-teal-600 hover:bg-teal-700 py-3 rounded font-bold transition">Login & Save</button>
                        <button onClick={()=>{setStep(1); setInputOtp(""); setGeneratedOtp(null);}} className="w-full mt-3 text-gray-400 text-sm">Edit Details</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- P2P Hook (Sends Metadata) ---
const usePeer = (user, onData, onConn, onCall, onError) => {
    const [myPeerId, setMyPeerId] = useState(null);
    const [status, setStatus] = useState("Jod raha hai...");
    const peerRef = useRef(null);
    const connRef = useRef({});

    useEffect(() => {
        if (!user) return;
        const cleanId = "eind-" + user.phone.replace(/\D/g, '');
        const p = new Peer(cleanId, { debug: 1 });
        
        p.on('open', (id) => { setMyPeerId(id); setStatus("Online"); });
        
        // When someone connects to us
        p.on('connection', (c) => {
            // Receive metadata (Name/Photo) from caller
            setupConn(c);
        });
        
        p.on('call', (c) => onCall && onCall(c));
        p.on('error', (e) => { setStatus(e.type === 'unavailable-id' ? "ID Active Elsewhere" : "Network Error"); if(onError) onError(e.type); });
        p.on('disconnected', () => { setStatus("Reconnecting..."); p.reconnect(); });

        peerRef.current = p;
        const interval = setInterval(() => Object.values(connRef.current).forEach(c => c.open && c.send({type:'ping'})), 5000);
        return () => { p.destroy(); clearInterval(interval); };
    }, [user]);

    const setupConn = (c) => {
        c.on('open', () => { 
            connRef.current[c.peer] = c; 
            if(onConn) onConn(c); 
        });
        c.on('data', (d) => { if(d.type!=='ping' && onData) onData(d, c.peer, c.metadata); });
        c.on('close', () => delete connRef.current[c.peer]);
    };

    const connect = (id) => { 
        if(peerRef.current) {
            // Send my profile data when connecting
            const conn = peerRef.current.connect(id, {
                reliable: true,
                metadata: { name: user.name, avatar: user.avatar } 
            });
            setupConn(conn);
        }
    };

    const send = (id, msg) => { const c = connRef.current[id]; if(c?.open) { c.send(msg); return true; } return false; };
    const call = (id, s) => peerRef.current?.call(id, s);

    return { myPeerId, connect, send, call, status };
};

// --- Main App ---
const App = () => {
    const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('eind_user_v9')) || null);
    const [chats, setChats] = useState(() => JSON.parse(localStorage.getItem('eind_chats_v9')) || [
        { id: 'bot', name: 'Eind Bot', avatar: '🤖', lastMsg: 'Namaste!', time: Date.now(), unread: 0, messages: [], type: 'dm' }
    ]);

    const [activeChat, setActiveChat] = useState(null);
    const [showQR, setShowQR] = useState(false);
    const [modalMode, setModalMode] = useState(null); // 'add_friend' or 'create_group'
    const [inputPhone, setInputPhone] = useState("");
    const [groupName, setGroupName] = useState("");
    const [groupMembers, setGroupMembers] = useState([]); // List of phone numbers
    
    const [notification, setNotification] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    useEffect(() => { if(user) localStorage.setItem('eind_user_v9', JSON.stringify(user)); }, [user]);
    useEffect(() => { localStorage.setItem('eind_chats_v9', JSON.stringify(chats)); }, [chats]);

    const notify = (m) => { setNotification(m); setTimeout(() => setNotification(null), 3000); };

    const handleLogout = () => {
        if(confirm("Logout? Chats save rahengi.")) {
            localStorage.removeItem('eind_user_v9');
            setUser(null);
        }
    };

    // --- Chat Logic ---
    const handleAddFriend = () => {
        if(!inputPhone || inputPhone.length < 10) return alert("Galat Number");
        const friendId = "eind-" + inputPhone.replace(/\D/g, '');
        
        if(chats.find(c => c.id === friendId)) { alert("Pehle se add hai!"); return; }

        const newChat = { 
            id: friendId, name: `User ${inputPhone.slice(-4)}`, avatar: '👤', 
            phone: inputPhone, lastMsg: 'Tap to chat', time: Date.now(), unread: 0, 
            type: 'dm', messages: [] 
        };
        setChats(prev => [newChat, ...prev]);
        setModalMode(null); setInputPhone("");
        peerControls.connect(friendId); notify("Dost Add Ho Gaya!");
    };

    const handleCreateGroup = () => {
        if(!groupName) return alert("Group ka naam rakhein");
        const members = inputPhone.split(',').map(p => p.trim()).filter(p => p.length >= 10);
        if(members.length === 0) return alert("Kam se kam 1 number daalein (comma se alag karein)");

        const groupId = "group-" + Date.now();
        const newGroup = {
            id: groupId, name: groupName, avatar: '👥',
            members: members, // Array of phone numbers
            lastMsg: 'Group Created', time: Date.now(), unread: 0,
            type: 'group', messages: []
        };
        
        setChats(prev => [newGroup, ...prev]);
        
        // Connect to all members immediately
        members.forEach(m => {
            const pid = "eind-" + m.replace(/\D/g, '');
            peerControls.connect(pid);
        });

        setModalMode(null); setInputPhone(""); setGroupName(""); notify("Group Ban Gaya!");
    };

    // --- Handlers ---
    const onData = (d, senderId, metadata) => {
        setChats(prev => {
            let updatedChats = [...prev];
            
            // Logic: Is this a group message?
            const isGroupMsg = d.groupId ? true : false;
            const targetId = isGroupMsg ? d.groupId : senderId;

            // Find existing chat (DM or Group)
            let chatIndex = updatedChats.findIndex(c => c.id === targetId);
            
            const msgContent = { 
                id: Date.now(), 
                type: d.type||'text', 
                content: d.content||d.text, 
                sender: 'them', 
                senderName: metadata?.name || d.senderName || 'Unknown', // Use sender name
                senderAvatar: metadata?.avatar || d.senderAvatar, 
                time: Date.now() 
            };

            if(chatIndex > -1) {
                const chat = updatedChats[chatIndex];
                // Update Peer Metadata (Name/Photo) if DM
                if(!isGroupMsg && metadata) {
                    chat.name = metadata.name;
                    chat.avatar = metadata.avatar || '👤';
                }
                
                chat.messages.push(msgContent);
                chat.lastMsg = d.type==='text' ? (isGroupMsg ? `${msgContent.senderName}: ${d.text}` : d.text) : 'Media';
                chat.time = Date.now();
                if(activeChat !== targetId) chat.unread += 1;
                
                // Move to top
                updatedChats.splice(chatIndex, 1);
                updatedChats.unshift(chat);
                return [...updatedChats];
            } 
            else if (isGroupMsg) {
                // Received message for a group I don't have locally (should verify membership logic ideally)
                // For simplicity: Create the group locally
                const newGroup = {
                    id: targetId, name: d.groupName || "Unknown Group", avatar: '👥',
                    type: 'group', members: [], lastMsg: `${msgContent.senderName}: ${d.text}`,
                    time: Date.now(), unread: 1, messages: [msgContent]
                };
                return [newGroup, ...prev];
            }
            else {
                // New DM from unknown user
                const newChat = {
                    id: senderId, 
                    name: metadata?.name || `User ${senderId.replace('eind-','')}`, 
                    avatar: metadata?.avatar || '👤',
                    type: 'dm', lastMsg: d.text, time: Date.now(), unread: 1, messages: [msgContent]
                };
                return [newChat, ...prev];
            }
        });
    };

    const onConn = (c) => {}; // Connection established silently
    const onIncomingCall = (c) => setIncomingCall(c);
    const answerCall = async () => { try { const s = await navigator.mediaDevices.getUserMedia({video:true, audio:true}); setLocalStream(s); incomingCall.answer(s); setupCall(incomingCall); setIncomingCall(null); } catch(e) { notify("Camera Error"); } };
    const startCall = async (id, type) => { try { const s = await navigator.mediaDevices.getUserMedia({video:type==='video', audio:true}); setLocalStream(s); setupCall(peerControls.call(id, s)); } catch(e) { notify("Camera Error"); } };
    const setupCall = (c) => { setActiveCall(c); c.on('stream', (s) => setRemoteStream(s)); c.on('close', endCall); c.on('error', endCall); };
    const endCall = () => { activeCall?.close(); localStream?.getTracks().forEach(t => t.stop()); setActiveCall(null); setIncomingCall(null); setLocalStream(null); setRemoteStream(null); };

    const peerControls = usePeer(user, onData, onConn, onIncomingCall, notify);

    const handleSend = async (txt, type='text', file=null) => {
        if(!activeChat) return;
        
        const currentChat = chats.find(c => c.id === activeChat);
        const newMsg = { id: Date.now(), type, content: txt, fileName: file, sender: 'me', time: Date.now() };
        
        // Update Local UI
        setChats(prev => prev.map(c => c.id === activeChat ? {...c, messages:[...c.messages, newMsg], lastMsg: type==='text'?txt:'Media', time: Date.now()} : c));

        // Payload
        const payload = {
            type, content: txt, text: txt, fileName: file,
            senderName: user.name,
            senderAvatar: user.avatar,
            groupId: currentChat.type === 'group' ? currentChat.id : null,
            groupName: currentChat.type === 'group' ? currentChat.name : null
        };

        if(currentChat.type === 'dm') {
            peerControls.send(activeChat, payload);
        } 
        else if (currentChat.type === 'group') {
            // Loop through all members and send
            currentChat.members.forEach(phone => {
                const pid = "eind-" + phone.replace(/\D/g, '');
                // Don't send to self
                if(pid !== peerControls.myPeerId) {
                    peerControls.connect(pid); // Ensure connection
                    setTimeout(() => peerControls.send(pid, payload), 500);
                }
            });
        }

        // Bot Logic
        if(activeChat === 'bot' && type === 'text') {
            setTimeout(() => {
                const botMsg = { id: Date.now()+1, type: 'text', content: `Hello ${user.name}! Main sirf ek demo bot hu.`, sender: 'them', senderName: 'Bot', time: Date.now() };
                setChats(prev => prev.map(c => c.id === 'bot' ? {...c, messages:[...c.messages, botMsg], lastMsg: 'Bot Reply', time: Date.now()} : c));
            }, 500);
        }
    };

    if (!user) return <LoginScreen onLogin={setUser} />;

    return (
        <div className="flex h-full w-full bg-app-dark overflow-hidden font-sans text-gray-100 relative">
            {notification && <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-800 px-4 py-2 rounded-full border border-app-teal z-50 shadow-lg whitespace-nowrap animate-bounce">{notification}</div>}
            
            {/* Call & Modals */}
            {incomingCall && <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4"><div className="bg-app-panel p-6 rounded-2xl flex flex-col items-center w-full max-w-sm"><div className="text-4xl animate-bounce mb-4">📞</div><h2 className="text-xl mb-4 text-center">Call Aa Raha Hai...</h2><div className="flex gap-8"><button onClick={()=>setIncomingCall(null)} className="bg-red-500 p-4 rounded-full"><Icon name="phone-slash" size={32} weight="fill"/></button><button onClick={answerCall} className="bg-green-500 p-4 rounded-full"><Icon name="phone" size={32} weight="fill"/></button></div></div></div>}
            {activeCall && <div className="fixed inset-0 bg-black z-[70] flex flex-col"><div className="flex-1 relative flex items-center justify-center">{remoteStream?<VideoPlayer stream={remoteStream} isLocal={false}/>:<div className="animate-pulse">Connecting...</div>}<div className="absolute bottom-4 right-4 w-28 h-40 bg-gray-800 rounded border border-gray-600"><VideoPlayer stream={localStream} isLocal={true}/></div></div><div className="h-20 flex items-center justify-center bg-gray-900 pb-safe"><button onClick={endCall} className="bg-red-600 p-4 rounded-full"><Icon name="phone-slash" size={32} weight="fill"/></button></div></div>}
            
            {/* Universal Modal (Friend/Group) */}
            {modalMode && <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                <div className="bg-app-panel p-6 rounded-xl w-full max-w-sm relative">
                    <button onClick={()=>{setModalMode(null); setGroupName(""); setInputPhone("");}} className="absolute top-3 right-3"><Icon name="x" size={24}/></button>
                    <h3 className="text-lg font-bold mb-4">{modalMode === 'add_friend' ? 'Naya Dost' : 'Naya Group'}</h3>
                    
                    {modalMode === 'create_group' && <input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Group Name" className="w-full bg-gray-700 p-3 rounded mb-3 outline-none" />}
                    
                    <textarea value={inputPhone} onChange={e=>setInputPhone(e.target.value)} placeholder={modalMode==='add_friend' ? "Phone Number" : "Numbers (comma laga kar likhein: 98.., 87..)"} className="w-full bg-gray-700 p-3 rounded mb-4 outline-none h-24 resize-none" type="tel"></textarea>
                    
                    <button onClick={modalMode==='add_friend' ? handleAddFriend : handleCreateGroup} className="w-full bg-teal-600 p-3 rounded font-bold hover:bg-teal-700">
                        {modalMode === 'add_friend' ? 'Chat Shuru Karein' : 'Group Banayein'}
                    </button>
                </div>
            </div>}

            {/* Sidebar */}
            <div className={`${activeChat?'hidden md:flex':'flex'} w-full md:w-[400px] flex-col border-r border-gray-700 bg-app-dark h-full z-10`}>
                <div className="h-16 bg-app-panel flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={()=>{navigator.clipboard.writeText(peerControls.myPeerId); notify("ID Copied");}}>
                        {user.avatar ? <img src={user.avatar} className="w-10 h-10 rounded-full object-cover"/> : <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center"><Icon name="user"/></div>}
                        <div className="overflow-hidden"><p className="text-sm font-bold truncate">{user.name}</p><p className={`text-xs truncate ${peerControls.status==='Online'?'text-green-400':'text-red-400'}`}>{peerControls.status}</p></div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={()=>setModalMode('create_group')} title="New Group" className="text-gray-400 hover:text-teal-400"><Icon name="users-three" size={24}/></button>
                        <button onClick={()=>setModalMode('add_friend')} title="Add Friend" className="text-gray-400 hover:text-teal-400"><Icon name="user-plus" size={24}/></button>
                        <button onClick={()=>setShowQR(true)} className="text-gray-400 hover:text-teal-400"><Icon name="qr-code" size={24}/></button>
                        <button onClick={handleLogout} title="Logout" className="text-gray-400 hover:text-red-400"><Icon name="sign-out" size={24}/></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">{chats.map(c=><div key={c.id} onClick={()=>setActiveChat(c.id)} className={`flex items-center p-3 cursor-pointer hover:bg-app-panel ${activeChat===c.id?'bg-app-panel':''}`}><div className="w-12 h-12 rounded-full bg-gray-600 mr-3 flex items-center justify-center text-2xl shrink-0 overflow-hidden">{c.avatar?.length>50 ? <img src={c.avatar} className="w-full h-full object-cover"/> : c.avatar}</div><div className="flex-1 border-b border-gray-800 pb-3 min-w-0"><div className="flex justify-between"><span className="font-bold truncate">{c.name}</span><span className="text-xs text-gray-500 shrink-0 ml-2">{formatTime(c.time)}</span></div><div className="flex justify-between"><span className="text-sm text-gray-400 truncate">{c.lastMsg}</span>{c.unread>0&&<span className="bg-app-teal text-black text-xs font-bold px-2 rounded-full ml-2">{c.unread}</span>}</div></div></div>)}</div>
                <div className="p-2 text-center text-xs text-gray-600 border-t border-gray-800 shrink-0 pb-safe">Eind Web v9 • Made in India 🇮🇳</div>
            </div>

            {/* Chat Area */}
            {activeChat ? <ChatWindow chat={chats.find(c=>c.id===activeChat)} onBack={()=>setActiveChat(null)} onSend={handleSend} onCall={startCall} /> : 
            <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-app-panel border-b-4 border-app-teal relative h-full"><div className="z-10 text-center p-4"><h1 className="text-6xl font-light mb-2">Eind</h1><p className="text-gray-400 text-xl">Secure P2P Chat</p><div className="flex gap-4 mt-6 justify-center"><button onClick={()=>setModalMode('add_friend')} className="bg-teal-600 px-6 py-2 rounded-full font-bold hover:bg-teal-700">Add Friend</button><button onClick={()=>setModalMode('create_group')} className="bg-gray-700 px-6 py-2 rounded-full font-bold hover:bg-gray-600">Create Group</button></div></div><div className="absolute inset-0 chat-bg"></div></div>}

            {showQR && <QRModal id={peerControls.myPeerId} onClose={()=>setShowQR(false)} onScan={peerControls.connect} />}
        </div>
    );
};

const ChatWindow = ({ chat, onBack, onSend, onCall }) => {
    const [txt, setTxt] = useState("");
    const endRef = useRef(null);
    const fileRef = useRef(null);
    useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [chat.messages]);
    const sendFile = async (e) => { const f = e.target.files[0]; if(!f || f.size>1.5*1024*1024) return alert("File > 1.5MB"); onSend(await fileToBase64(f), f.type.startsWith('image')?'image':f.type.startsWith('video')?'video':'file', f.name); };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] relative w-full overflow-hidden">
            <div className="absolute inset-0 chat-bg"></div>
            <div className="h-16 bg-app-panel flex items-center px-4 shrink-0 z-20 border-l border-gray-700 shadow w-full">
                <button onClick={onBack} className="md:hidden mr-2 p-2"><Icon name="arrow-left"/></button>
                <div className="w-10 h-10 rounded-full bg-gray-600 mr-3 flex items-center justify-center text-xl shrink-0 overflow-hidden">{chat.avatar?.length>50 ? <img src={chat.avatar} className="w-full h-full object-cover"/> : chat.avatar}</div>
                <div className="flex-1 min-w-0"><h2 className="font-bold truncate">{chat.name}</h2><p className="text-xs text-gray-400">{chat.type === 'group' ? 'Group Chat' : chat.phone}</p></div>
                <div className="flex gap-3 text-app-teal shrink-0">{chat.isP2P && <><button onClick={()=>onCall(chat.id,'video')} className="p-2"><Icon name="video-camera" size={24} weight="fill"/></button><button onClick={()=>onCall(chat.id,'audio')} className="p-2"><Icon name="phone" size={24} weight="fill"/></button></>}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 z-10 flex flex-col gap-2 w-full custom-scrollbar">
                {chat.messages.map(m => (
                    <div key={m.id} className={`max-w-[85%] ${m.sender==='me'?'self-end':'self-start'}`}>
                        <div className={`p-2 rounded-lg shadow relative ${m.sender==='me'?'bg-message-out rounded-tr-none':'bg-message-in rounded-tl-none'}`}>
                            {/* Group Chat: Show Sender Name */}
                            {chat.type==='group' && m.sender!=='me' && <p className="text-xs text-orange-400 font-bold mb-1">{m.senderName || 'User'}</p>}
                            
                            {m.type==='text' && <p className="text-sm pr-12 whitespace-pre-wrap leading-relaxed">{m.content}</p>}
                            {m.type==='image' && <div className="relative"><img src={m.content} className="max-w-[250px] rounded"/><a href={m.content} download={m.fileName} className="absolute bottom-1 right-1 bg-black/50 p-1 rounded text-white"><Icon name="download-simple"/></a></div>}
                            {m.type==='video' && <video src={m.content} controls className="max-w-[250px] rounded"/>}
                            <span className="text-[10px] text-gray-400 absolute bottom-1 right-2 flex items-center gap-1">{formatTime(m.time)}{m.sender==='me'&&<Icon name="checks" className="text-blue-300" size={12}/>}</span>
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
            <div className="min-h-[60px] bg-app-panel px-4 py-2 flex items-center gap-3 z-20 shrink-0 w-full pb-safe">
                <input type="file" ref={fileRef} className="hidden" onChange={sendFile} accept="image/*,video/*"/>
                <button onClick={()=>fileRef.current.click()} className="text-gray-400 p-1"><Icon name="plus" size={24}/></button>
                <div className="flex-1 bg-[#2a3942] rounded-lg px-4 py-2"><input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(onSend(txt),setTxt(''))} placeholder="Message..." className="w-full bg-transparent outline-none text-sm"/></div>
                {txt ? <button onClick={()=>{onSend(txt);setTxt('')}} className="text-app-teal p-1"><Icon name="paper-plane-right" size={24} weight="fill"/></button> : <Icon name="microphone" className="text-gray-400 p-1" size={24}/>}
            </div>
        </div>
    );
};

const QRModal = ({ id, onClose, onScan }) => {
    const [tab, setTab] = useState(0);
    const [val, setVal] = useState('');
    const ref = useRef(null);
    useEffect(() => { if(tab===0 && ref.current) { ref.current.innerHTML=''; new QRCode(ref.current, {text:id, width:180, height:180, colorDark:"#111b21", colorLight:"#fff"}); } }, [tab, id]);
    useEffect(() => { if(tab===1) { const s = new Html5Qrcode("reader"); s.start({facingMode:"environment"}, {fps:10, qrbox:250}, (t)=>{s.stop(); onScan(t);}, ()=>{}).catch(()=>{}); return ()=>s.isScanning&&s.stop(); } }, [tab]);
    return (
        <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-sm p-5 relative text-gray-800">
                <button onClick={onClose} className="absolute top-3 right-3"><Icon name="x" size={24}/></button>
                <div className="flex bg-gray-100 p-1 rounded-lg mb-4"><button onClick={()=>setTab(0)} className={`flex-1 py-1 rounded ${tab===0?'bg-white shadow text-teal-600':''}`}>My ID</button><button onClick={()=>setTab(1)} className={`flex-1 py-1 rounded ${tab===1?'bg-white shadow text-teal-600':''}`}>Scan</button></div>
                <div className="h-[250px] flex flex-col items-center justify-center">
                    {tab===0 ? <><div ref={ref} className="border p-2 rounded"></div><div className="mt-2 bg-gray-100 px-2 py-1 rounded font-mono text-sm break-all">{id}</div></> : 
                    <><div id="reader" className="w-full h-full bg-black rounded overflow-hidden mb-2"></div><div className="flex w-full gap-2"><input value={val} onChange={e=>setVal(e.target.value)} placeholder="Paste ID" className="flex-1 border p-1 rounded"/><button onClick={()=>onScan(val)} className="bg-teal-600 text-white px-3 rounded">Go</button></div></>}
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
