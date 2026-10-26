// Checks the installation form before Softaculous submits it (only formcheck() is called)
function formcheck(){
	var name = $('site_name').value.replace(/^\s+|\s+$/g, '');
	var user = $('admin_username').value;
	var pass = $('admin_pass').value;
	if(name === ''){
		alert('{{err_name}}');
		return false;
	}
	if(!/^[A-Za-z0-9._@-]{3,32}$/.test(user)){
		alert('{{err_user}}');
		return false;
	}
	if(pass.length < 8 || pass.toLowerCase() === 'admin' || pass === user){
		alert('{{err_pass}}');
		return false;
	}
	if(window.check_punycode && !check_punycode($('admin_email').value)){
		alert('{{err_ademail}}');
		return false;
	}
	return true;
};
