import { initializeApp } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, onSnapshot, serverTimestamp, orderBy, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.24.0/firebase-storage.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyClDjc6wUuwXlTSOTPgI-aFVQU23GVeZUA",
  authDomain: "squadly2025.firebaseapp.com",
  projectId: "squadly2025",
  storageBucket: "squadly2025.firebasestorage.app",
  messagingSenderId: "46019416196",
  appId: "1:46019416196:web:a098d815c7c6e0b210b2d1",
  measurementId: "G-PX0SMQV7J0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let currentChatId = null;

// LOGIN
document.getElementById("loginBtn").onclick = async () => {
  await signInWithPopup(auth, provider);
};

onAuthStateChanged(auth, async user => {
  if(!user) return;
  currentUser = user;
  await setDoc(doc(db,"users",user.uid),{
    name:user.displayName,
    avatarUrl:user.photoURL || "",
    uid:user.uid,
    createdAt:serverTimestamp()
  }, { merge:true });

  document.getElementById("loginBox").style.display="none";
  document.getElementById("app").style.display="flex";
  document.getElementById("profilePic").src=user.photoURL;
  document.getElementById("displayName").innerText=user.displayName;

  loadChatList();
  setupUserSearch();
});

// SEARCH USERS
function setupUserSearch(){
  const search = document.getElementById("searchUser");
  const container = document.getElementById("searchResults");
  search.oninput = async () => {
    container.innerHTML = "";
    const qSnap = await getDocs(collection(db,"users"));
    qSnap.forEach(uDoc=>{
      const u=uDoc.data();
      if(u.uid !== currentUser.uid && u.name.toLowerCase().includes(search.value.toLowerCase())){
        const div=document.createElement("div");
        div.innerText=u.name;
        div.style.padding="8px";
        div.style.cursor="pointer";
        div.onclick=()=>startChat(currentUser.uid,u.uid);
        container.appendChild(div);
      }
    });
  };
}

// START 1:1 CHAT
async function startChat(uid1, uid2){
  const members=[uid1,uid2].sort();
  const chatId=members.join("_");
  const chatRef=doc(db,"chats",chatId);
  const snap=await getDoc(chatRef);
  if(!snap.exists()){
    await setDoc(chatRef,{
      members,
      type:"dm",
      lastUpdated:serverTimestamp()
    });
  }
  loadChat(chatId);
}

// LOAD CHAT LIST
function loadChatList(){
  const chatList = document.getElementById("chatList");
  const q = query(collection(db,"chats"), where("members","array-contains",currentUser.uid), orderBy("lastUpdated","desc"));
  onSnapshot(q, snap=>{
    chatList.innerHTML="";
    snap.forEach(c=>{
      const chat=c.data();
      const div=document.createElement("div");
      div.innerText=chat.type==="dm"?chat.members.filter(m=>m!==currentUser.uid).join(", "):chat.name;
      div.style.padding="8px";
      div.style.cursor="pointer";
      div.style.background="#1a1d27";
      div.style.borderRadius="6px";
      div.style.marginBottom="5px";
      div.onclick=()=>loadChat(c.id);
      chatList.appendChild(div);
    });
  });
}

// LOAD CHAT
function loadChat(chatId){
  currentChatId=chatId;
  const messagesDiv = document.getElementById("messages");
  const msgsRef=collection(db,"chats",chatId,"messages");
  const q=query(msgsRef,orderBy("createdAt","asc"));
  onSnapshot(q, snap=>{
    messagesDiv.innerHTML="";
    snap.forEach(m=>{
      const d=m.data();
      const div=document.createElement("div");
      div.className="chatMessage"+(d.from===currentUser.uid?" me":"");
      if(d.type==="audio"){
        const audio=document.createElement("audio");
        audio.src=d.audioUrl;
        audio.controls=true;
        div.appendChild(audio);
      } else div.innerText=d.text;
      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTop=messagesDiv.scrollHeight;
  });
}

// SEND MESSAGE
document.getElementById("sendBtn").onclick=async ()=>{
  const txt=document.getElementById("messageInput").value;
  if(!txt.trim()||!currentChatId) return;
  await addDoc(collection(db,"chats",currentChatId,"messages"),{
    text:txt,
    type:"text",
    from:currentUser.uid,
    createdAt:serverTimestamp()
  });
  await updateDoc(doc(db,"chats",currentChatId),{lastUpdated:serverTimestamp()});
  document.getElementById("messageInput").value="";
};

// VOICE NOTES
document.getElementById("voiceBtn").onclick=async ()=>{
  if(!currentChatId) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
  const mediaRecorder = new MediaRecorder(stream);
  let chunks=[];
  mediaRecorder.ondataavailable = e => { chunks.push(e.data); };
  mediaRecorder.onstop = async ()=>{
    const blob=new Blob(chunks,{type:"audio/mp3"});
    const fileRef = ref(storage, `voiceNotes/${currentChatId}/${Date.now()}.mp3`);
    await uploadBytes(fileRef,blob);
    const url = await getDownloadURL(fileRef);
    await addDoc(collection(db,"chats",currentChatId,"messages"),{
      type:"audio",
      from:currentUser.uid,
      audioUrl:url,
      createdAt:serverTimestamp()
    });
  };
  mediaRecorder.start();
  setTimeout(()=>mediaRecorder.stop(),5000);
};

// GROUP CHAT MODAL
const groupModal=document.getElementById("groupModal");
document.getElementById("createGroupBtn").onclick=()=>{
  groupModal.style.display="flex";
  loadGroupUserList();
};
document.getElementById("closeGroupModal").onclick=()=>groupModal.style.display="none";

async function loadGroupUserList(){
  const container=document.getElementById("groupUserList");
  container.innerHTML="";
  const qSnap=await getDocs(collection(db,"users"));
  qSnap.forEach(u=>{
    const user=u.data();
    if(user.uid===currentUser.uid) return;
    const div=document.createElement("div");
    const cb=document.createElement("input");
    cb.type="checkbox";
    cb.value=user.uid;
    div.appendChild(cb);
    div.appendChild(document.createTextNode(" "+user.name));
    container.appendChild(div);
  });
}

document.getElementById("createGroupConfirm").onclick=async ()=>{
  const name=document.getElementById("groupNameInput").value||"Group Chat";
  const checkboxes=document.querySelectorAll("#groupUserList input:checked");
  const members=[currentUser.uid];
  checkboxes.forEach(cb=>members.push(cb.value));
  const chatRef=doc(collection(db,"chats"));
  await setDoc(chatRef,{members,type:"group",name,lastUpdated:serverTimestamp()});
  groupModal.style.display="none";
};
