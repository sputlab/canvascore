<?php
// CanvasCore for Softaculous: install.php (for individual softwares). Softaculous has already copied the files of canvascore.zip into
// the chosen folder when __install() runs. CanvasCore keeps its data in SQLite, so no MySQL database is made: this hands the answers of the
// form to CanvasCore's own installer (a provisioning file, used once and deleted: the password goes in as a hash) and checks that it finished.
// All functions in this file begin with two underscores, as Softaculous asks.

if(!defined('SOFTACULOUS')){

	die('Hacking Attempt');

}

function __install(){

global $__settings, $error, $software, $globals;

	__requirements();
	if(!empty($error)){
		return false;
	}

	$path = rtrim($__settings['softpath'], '/');
	$url = rtrim($__settings['softurl'], '/');
	$admin = $path.'/canvascore-admin';
	if(!is_file($admin.'/install.php') || !is_file($admin.'/installlib.php')){
		$error[] = '{{err_install}} canvascore-admin/installlib.php is missing.';
		return false;
	}

	$starter = isset($__settings['starter']) ? (string)$__settings['starter'] : '';
	$answers = array(
		'site_name' => trim($__settings['site_name']),
		'site_url' => $url,
		'admin_user' => trim($__settings['admin_username']),
		'admin_pass_hash' => password_hash($__settings['admin_pass'], PASSWORD_DEFAULT),
		'admin_email' => trim($__settings['admin_email']),
		'starter' => $starter === 'none' ? '' : $starter,
		'delete_installer' => true
	);
	// One request first: CanvasCore writes its folder's access rules (.htaccess) the first time it runs, before a file with the answers exists
	__call_installer($url.'/canvascore-admin/install.php?format=json');

	$file = $admin.'/install-provision.json';
	if(@file_put_contents($file, json_encode($answers), LOCK_EX) === false){
		$error[] = '{{err_install}} '.$file.' could not be written.';
		return false;
	}
	@chmod($file, 0600);

	// CanvasCore's own installer takes it from here. If this server cannot call itself, the file stays and the first visit to
	// canvascore-admin/install.php finishes the setup (it is deleted as soon as it is used).
	$res = __call_installer($url.'/canvascore-admin/install.php?format=json');
	if($res !== null){
		if(empty($res['success'])){
			@unlink($file);
			$error[] = '{{err_install}} '.(isset($res['message']) ? $res['message'] : '');
			return false;
		}
	}
}

// The installer's JSON answer, or null when it could not be reached
function __call_installer($url){

	$body = false;
	if(function_exists('curl_init')){
		$ch = curl_init($url);
		curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0));
		$body = curl_exec($ch);
		if(PHP_VERSION_ID < 80000){
			curl_close($ch);
		}
	}elseif(ini_get('allow_url_fopen')){
		$ctx = stream_context_create(array('http' => array('timeout' => 60, 'ignore_errors' => true), 'ssl' => array('verify_peer' => false, 'verify_peer_name' => false)));
		$body = @file_get_contents($url, false, $ctx);
	}
	if($body === false || $body === ''){
		return null;
	}
	$d = json_decode($body, true);
	return is_array($d) ? $d : null;
}

function __requirements(){

global $__settings, $error, $software;

	if(version_compare(PHP_VERSION, '8.0.0', '<')){
		$error[] = '{{err_php}}';
		return false;
	}
	foreach(array('pdo_sqlite', 'dom', 'json', 'session') as $ext){
		if(!extension_loaded($ext)){
			$error[] = '{{err_php}} ('.$ext.')';
			return false;
		}
	}
	return true;
}

// Just validate an email
function __email_address($email){

global $error;

	if(function_exists('emailvalidation') && !emailvalidation($email)){
		$error[] = '{{err_wrongemail}}';
	}
	return $email;
}

// The administrator password: CanvasCore refuses short or obvious ones
function __ad_pass($password){

global $error;

	if(strlen($password) < 8 || strtolower($password) === 'admin'){
		$error[] = '{{err_pass}}';
	}
	return $password;
}
