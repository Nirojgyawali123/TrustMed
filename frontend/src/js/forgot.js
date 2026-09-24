import { authAPI } from '/src/api.js';

let storedEmail = '';
let resetToken = '';
let countdownIv = null;
let cooldown = 0;

const dot1 = document.getElementById('dot1');
const dot2 = document.getElementById('dot2');
const dot3 = document.getElementById('dot3');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const sub = document.getElementById('stepSub');
const statusOk = document.getElementById('fpStatusOk');

function setStep(n){
  step1.style.display = n===1? '':'none';
  step2.style.display = n===2? '':'none';
  step3.style.display = n===3? '':'none';
  [dot1,dot2,dot3].forEach((d,i)=>{
    d.classList.remove('active','done');
    if(i+1 < n) d.classList.add('done');
    if(i+1 === n) d.classList.add('active');
  });
  sub.textContent = n===1 ? 'Enter your details to receive an OTP via Gmail.' : n===2 ? 'Check your Gmail for the blue OTP code.' : 'Set a new password.';
}

function startCooldown(sec=60){
  cooldown = sec;
  const el = document.getElementById('fpCountdown');
  const btn = document.getElementById('fpResend');
  btn.disabled = true;
  if(countdownIv) clearInterval(countdownIv);
  el.textContent = `${cooldown}s`;
  countdownIv = setInterval(()=>{
    cooldown--;
    el.textContent = cooldown>0 ? `${cooldown}s` : 'Ready';
    if(cooldown<=0){
      clearInterval(countdownIv);
      btn.disabled = false;
      el.textContent = 'You can resend';
    }
  }, 1000);
}

document.getElementById('fpBtn1').addEventListener('click', async ()=>{
  const full_name = document.getElementById('fpName').value.trim();
  const phone = document.getElementById('fpPhone').value.trim();
  const citizenship = document.getElementById('fpCit').value.trim();
  const email = document.getElementById('fpEmail').value.trim().toLowerCase();
  const address = document.getElementById('fpAddr').value.trim();
  const st = document.getElementById('fpStatus1');

  if(!full_name||!phone||!citizenship||!email||!address){
    st.textContent='Fill all 5 fields. All must match your signup info.';
    st.style.color='var(--danger)';
    return;
  }
  if(!email.includes('@')){
    st.textContent='Enter a valid Gmail.';
    st.style.color='var(--danger)'; return;
  }
  st.style.color='var(--gray-500)';
  st.textContent='Verifying & sending OTP...';
  try{
    const res = await authAPI.forgotRequest({full_name, phone, citizenship, email, address});
    storedEmail = email;
    document.getElementById('fpEmailShow').textContent = email;
    setStep(2);
    st.textContent='';
    const s2 = document.getElementById('fpStatus2');
    s2.style.color='var(--success)';
    s2.textContent = res.detail || 'OTP sent. Check Gmail (including spam).';
    if(res.dev_otp){
      s2.textContent += ` [Dev OTP: ${res.dev_otp}]`;
    }
    startCooldown(60);
  }catch(err){
    st.style.color='var(--danger)';
    st.textContent = err.message;
  }
});

document.getElementById('fpOtp').addEventListener('input', e=>{
  e.target.value = e.target.value.replace(/\D/g,'').slice(0,6);
});

document.getElementById('fpBtn2').addEventListener('click', async ()=>{
  const otp = document.getElementById('fpOtp').value.trim();
  const st = document.getElementById('fpStatus2');
  if(otp.length!==6){
    st.style.color='var(--danger)'; st.textContent='Enter 6-digit code.'; return;
  }
  st.style.color='var(--gray-500)'; st.textContent='Verifying...';
  try{
    const res = await authAPI.forgotVerify(storedEmail, otp);
    resetToken = res.reset_token;
    setStep(3);
    st.textContent='';
  }catch(err){
    st.style.color='var(--danger)';
    st.textContent = err.message;
  }
});

document.getElementById('fpResend').addEventListener('click', async ()=>{
  const st = document.getElementById('fpStatus2');
  if(cooldown>0){ st.textContent=`Wait ${cooldown}s`; return; }
  // Re-use stored 5 fields: need to re-send via same endpoint
  // We keep values from step1
  const full_name = document.getElementById('fpName').value.trim();
  const phone = document.getElementById('fpPhone').value.trim();
  const citizenship = document.getElementById('fpCit').value.trim();
  const email = storedEmail || document.getElementById('fpEmail').value.trim().toLowerCase();
  const address = document.getElementById('fpAddr').value.trim();
  st.style.color='var(--gray-500)'; st.textContent='Resending...';
  try{
    const res = await authAPI.forgotRequest({full_name, phone, citizenship, email, address});
    st.style.color='var(--success)';
    st.textContent='OTP resent. Check Gmail.';
    if(res.dev_otp) st.textContent += ` [Dev OTP: ${res.dev_otp}]`;
    startCooldown(60);
  }catch(err){
    st.style.color='var(--danger)'; st.textContent = err.message;
  }
});

document.getElementById('fpBack1').addEventListener('click', (e)=>{
  e.preventDefault(); setStep(1);
});

document.getElementById('fpBtn3').addEventListener('click', async ()=>{
  const np = document.getElementById('fpNew').value;
  const cp = document.getElementById('fpConfirm').value;
  const st = document.getElementById('fpStatus3');
  if(!np || np.length<4){
    st.style.color='var(--danger)'; st.textContent='Password must be at least 4 characters.'; return;
  }
  if(np!==cp){
    st.style.color='var(--danger)'; st.textContent='Passwords do not match.'; return;
  }
  if(!resetToken){
    st.style.color='var(--danger)'; st.textContent='No reset token. Verify OTP first.'; return;
  }
  st.style.color='var(--gray-500)'; st.textContent='Resetting...';
  try{
    const res = await authAPI.forgotReset(resetToken, np);
    st.textContent='';
    statusOk.style.display='block';
    statusOk.textContent = res.detail || 'Password updated. Redirecting to login...';
    setTimeout(()=> window.location.href='login.html', 1600);
  }catch(err){
    st.style.color='var(--danger)'; st.textContent = err.message;
  }
});
