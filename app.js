function memberEditSubmission(data){
  data=data||{};
  var obj={photo:data.photo_url||'',scale:data.photo_scale||1,x:data.photo_pos_x==null?50:data.photo_pos_x,y:data.photo_pos_y==null?50:data.photo_pos_y};
  openModal(
    '<div class="portal-profile-view">'+
      '<div class="portal-profile-top"><button type="button" class="mini-btn" id="memberEditBack">← BACK</button><span class="portal-profile-kicker">MEMBER · EDIT PROFILE</span></div>'+
      '<h2 class="modal-title">Edit your profile.</h2>'+
      '<p class="modal-sub">Change your name, date of birth, phone, email, profile photo or password. Unique ID, position and approval remain admin-controlled.</p>'+
      '<form id="memberEditSubmissionForm"><div class="form-grid">'+
        '<div class="field"><label>Full name</label><input id="meName" value="'+esc(data.name||'')+'" required></div>'+
        '<div class="field"><label>Date of birth</label><input id="meDob" type="date" value="'+esc(data.dob||'')+'" required></div>'+
        '<div class="field"><label>Phone</label><input id="mePhone" value="'+esc(data.phone||'')+'" required></div>'+
        '<div class="field"><label>Email</label><input id="meEmail" type="email" value="'+esc(data.email||'')+'" required></div>'+
        '<div class="field"><label>Current password</label><input id="meCurrentPass" type="password" autocomplete="current-password" placeholder="Only needed to change password"></div>'+
        '<div class="field"><label>New password</label><input id="meNewPass" type="password" autocomplete="new-password" minlength="8" placeholder="Leave blank to keep"></div>'+
        '<div class="field"><label>Confirm new password</label><input id="meConfirmPass" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter new password"></div>'+
        '<div class="field full"><label>Profile photo</label><input id="mePhoto" type="file" accept="image/*"></div>'+
      '</div>'+imageEditor('memberEditPhoto',obj.photo,obj.scale,obj.x,obj.y)+
      '<div class="form-actions"><button type="submit" class="btn gold">SAVE PROFILE <span>✓</span></button></div></form>'+
    '</div>'
  );
  wireEditor('memberEditPhoto',obj,'mePhoto');
  var back=$('#memberEditBack');
  if(back) back.addEventListener('click',function(){memberDashboard(data);});
  $('#memberEditSubmissionForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      btn.disabled=true;
      var newPass=$('#meNewPass').value;
      var confirmPass=$('#meConfirmPass').value;
      if(newPass!==confirmPass) throw new Error('New password and confirmation do not match');
      if(newPass && newPass.length<8) throw new Error('New password must be at least 8 characters');
      var payload={name:$('#meName').value.trim(),dob:$('#meDob').value,phone:$('#mePhone').value.trim(),email:$('#meEmail').value.trim(),current_password:$('#meCurrentPass').value,new_password:newPass,photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y};
      if(!payload.name||!payload.dob||!payload.phone||!payload.email) throw new Error('Please complete all required fields');
      if(!obj.photo) throw new Error('Please keep or choose a member photo');
      if(String(obj.photo).startsWith('data:image/')){
        btn.textContent='UPDATING PROFILE…';
        var croppedPhoto=await yycManualSquareCrop(obj.photo,obj.scale,obj.x,obj.y,760);
        payload.photo_data=await uploadYYCImage(croppedPhoto,'member-profile',memberToken,data.id||'',data.photo_url||'');
        payload.photo_scale=1; payload.photo_pos_x=50; payload.photo_pos_y=50;
      }
      var r=await rpc('member_update_submission',{p_token:memberToken,p_payload:payload});
      if(!r||!r.ok) throw new Error(r&&r.error||'Could not save profile');
      yycSafeSet(localStorage,'yyc_member_profile_v1',JSON.stringify(r.member));
      closeModal();
      memberDashboard(r.member);
      toast(r.password_changed?'Profile and password updated':'Profile updated');
    }catch(err){
      btn.disabled=false;
      toast(err.message||'Could not save profile');
    }
  });
}
function leaderEditProfile(data){
  data=data||{};
  var obj={photo:data.photo_url||'',scale:data.photo_scale||1,x:data.photo_pos_x==null?50:data.photo_pos_x,y:data.photo_pos_y==null?50:data.photo_pos_y};
  openModal(
    '<div class="portal-profile-view">'+
      '<div class="portal-profile-top"><button type="button" class="mini-btn" id="leaderEditBack">← BACK</button><span class="portal-profile-kicker">LEADER · EDIT PROFILE</span></div>'+
      '<h2 class="modal-title">Edit your profile.</h2>'+
      '<p class="modal-sub">Change your name, date of birth, phone, email, profile photo or password. Role, Unique ID and access remain admin-controlled.</p>'+
      '<form id="leaderEditProfileForm"><div class="form-grid">'+
        '<div class="field"><label>Full name</label><input id="leName" value="'+esc(data.name||'')+'" required></div>'+
        '<div class="field"><label>Date of birth</label><input id="leDob" type="date" value="'+esc(data.dob||'')+'" required></div>'+
        '<div class="field"><label>Phone</label><input id="lePhone" value="'+esc(data.phone||'')+'"></div>'+
        '<div class="field"><label>Email</label><input id="leEmail" type="email" value="'+esc(data.email||'')+'" required></div>'+
        '<div class="field"><label>Current password</label><input id="leCurrentPass" type="password" autocomplete="current-password" placeholder="Only needed to change password"></div>'+
        '<div class="field"><label>New password</label><input id="leNewPass" type="password" autocomplete="new-password" minlength="8" placeholder="Leave blank to keep"></div>'+
        '<div class="field"><label>Confirm new password</label><input id="leConfirmPass" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter new password"></div>'+
        '<div class="field full"><label>Profile photo</label><input id="lePhoto" type="file" accept="image/*"></div>'+
      '</div>'+imageEditor('leaderEditPhoto',obj.photo,obj.scale,obj.x,obj.y)+
      '<div class="form-actions"><button type="submit" class="btn gold">SAVE PROFILE <span>✓</span></button></div></form>'+
    '</div>'
  );
  wireEditor('leaderEditPhoto',obj,'lePhoto');
  var back=$('#leaderEditBack');
  if(back) back.addEventListener('click',function(){leaderDashboard(data);});
  $('#leaderEditProfileForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      btn.disabled=true;
      var newPass=$('#leNewPass').value;
      var confirmPass=$('#leConfirmPass').value;
      if(newPass!==confirmPass) throw new Error('New password and confirmation do not match');
      if(newPass && newPass.length<8) throw new Error('New password must be at least 8 characters');
      var payload={name:$('#leName').value.trim(),dob:$('#leDob').value,phone:$('#lePhone').value.trim(),email:$('#leEmail').value.trim(),current_password:$('#leCurrentPass').value,new_password:newPass,photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y};
      if(!payload.name||!payload.dob||!payload.email) throw new Error('Please complete your name, date of birth and email');
      if(!obj.photo) throw new Error('Please keep or choose a leader photo');
      if(String(obj.photo).startsWith('data:image/')){
        btn.textContent='UPDATING PROFILE…';
        var croppedPhoto=await yycManualSquareCrop(obj.photo,obj.scale,obj.x,obj.y,760);
        payload.photo_data=await uploadYYCImage(croppedPhoto,'leader-profile',leaderToken,data.id||'',data.photo_url||'');
        payload.photo_scale=1; payload.photo_pos_x=50; payload.photo_pos_y=50;
      }
      var r=await rpc('leader_update_profile',{p_token:leaderToken,p_payload:payload});
      if(!r||!r.ok) throw new Error(r&&r.error||'Could not save profile');
      yycSafeSet(localStorage,'yyc_leader_profile_v1',JSON.stringify(r.leader));
      closeModal();
      leaderDashboard(r.leader);
      toast(r.password_changed?'Profile and password updated':'Profile updated');
    }catch(err){
      btn.disabled=false;
      toast(err.message||'Could not save profile');
    }
  });
}


