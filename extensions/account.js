// Accounts submodule
// Includes functions for account actions

var protocol = require('../protocol.js');
var WhatsApi = module.exports;

/**
 * Requests contacts sync
 * @param {Array}   contacts    Array of contacts to be synced; single string phone number is accepted
 * @param {String}  mode        The sync mode. 'full' or 'delta'
 * @param {String}  context     The sync context. 'registration' or 'background' (more info in the wiki)
 * @param {SyncCallback} callback    Called when sync results are ready
 */
WhatsApi.requestContactsSync = function(contacts, mode, context, callback) {
	if (!util.isArray(contacts)) {
		contacts = [contacts];
	}
	
	mode = mode || 'full';
	context = context || 'registration';
	
	// Create user nodes
	var users = [];
	for (var i = 0; i < contacts.length; i++) {
		var number = contacts[i];
		// Fix numbers without leading '+'
		number = '+' + number.replace('+', '');
		
		users.push(new protocol.Node('user', null, null, number));
	};
	
	var id = this.nextMessageId('sendsync_');
	this.addCallback(id, callback);
	
	var node = new protocol.Node(
		'iq',
		{
			type: 'get',
			id: id,
			xmlns: 'urn:xmpp:whatsapp:sync'
		},
		[ new protocol.Node(
			'sync',
			{
				mode: mode,
				context: context,
				sid: common.winTimestamp().toString(),
				index: '0',
				last: 'true'
			},
			users,
			null
		) ],
		null
	);
	
	this.sendNode(node);
};

/**
 * Update privacy settings
 * @param {String} name  The name of the setting to update: 'last' for last seen, 'status', 'profile' for profile picture
 * @param {String} value The new value for the setting: 'all', 'contacts', 'none'
 */
WhatsApi.setPrivacySettings = function(name, value){
	var node = new protocol.Node('category', 
		{
			name  : name,
			value : value
		}
	);

    var attributes = {
    	to    : this.config.server,
        type  : 'set',
        xmlns : 'privacy',
        id    : this.nextMessageId('send_privacy_settings_')
    };

    var child =  new protocol.Node('privacy', null, [node]);

    this.sendNode(new protocol.Node('iq', attributes, [child]));
};

/**
 * Request privacy settings for the current user
 */
WhatsApi.requestPrivacySettings = function(){
    var attributes = {
    	to    : this.config.server,
        type  : 'get',
        xmlns : 'privacy',
        id    : this.nextMessageId('get_privacy_settings_')
    };

    var child =  new protocol.Node('privacy');

    this.sendNode(new protocol.Node('iq', attributes, [child]));
};

/**
 * Set current logged in user status
 * @param {String} status The new status message
 */
WhatsApi.setStatus = function(status){
    var child = new protocol.Node('status', null, null, status);

    var attributes = {
    	to    : this.config.server,
        type  : 'set',
        id    : this.nextMessageId('sendstatus'),
        xmlns : 'status'
    };

    this.sendNode(new protocol.Node('iq', attributes, [child]));
};

/**
 * Request status for the given number
 * @param  {String} number Phone number
 */
WhatsApi.requestStatus = function(number) {
	this.requestStatuses([number]);
};

/**
 * Request statuses for the given array of phone numbers
 * @param {Array} numbers   Array of phone numbers
 */
WhatsApi.requestStatuses = function(numbers){
	// String to Array, just in case
	if (!util.isArray(numbers)) {
		numbers = [numbers];
	}
	
	var contacts = [];

	for (var i = 0; i < numbers.length; i++) {
		var userNode = new protocol.Node(
			'user',
			{
				jid : this.createJID(numbers[i]),
			}
		);
		contacts.push(userNode);
	}

    var attributes = {
    	to    : this.config.server,
        type  : 'get',
        xmlns : 'status',
        id    : this.nextMessageId('getstatus')
    };

    var node = new protocol.Node(
    	'iq',
    	attributes,
    	[
    		new protocol.Node('status', null, contacts)
    	]
    );

    this.sendNode(node);
};

/**
 * Request last seen time for given user
 * @param {String}   who       Phone number
 * @param {LastSeenCallback} callback  Called when the last seen time is received
 */
WhatsApi.requestLastSeen = function(who, callback) {
	var messageId = this.nextMessageId('lastseen');
	this.addCallback(messageId, callback);
		
	var queryNode = new protocol.Node('query');

	var attributes = {
		to   : this.createJID(who),
		type : 'get',
		id   : messageId,
		xmlns: 'jabber:iq:last'
	};

	this.sendNode(new protocol.Node('iq', attributes, [queryNode]));
};

/**
 * Set a new profile picture for the active account
 *
 * @param {String} filepath   Path or URL to a valid JPEG image. Do not use a large image because we can only send a max of approx. 65.000 bytes and that includes the generated thumbnail.
 * @example
 * //sets a random image as profile picture. Image is retrieved from lorempixel.com
 * wa.setProfilePicture('http://lorempixel.com/400/400/?.jpg');
 */
WhatsApi.setProfilePicture = function(filepath, callback) {
	var pictureNode, thumbNode;
	var attributes = {
		id: this.nextMessageId('setphoto'),
		to: this.createJID(this.config.msisdn),
		type: 'set',
		xmlns:'w:profile:picture'
	};

	var onThumbReady = function(err, data) {
		// 'data' is returned as a base64 string
		if (err) {
			var errorObj = {
				code: 100,
				message: err
			};
			callback(errorObj);
			return;
		}
		thumbNode = new protocol.Node('picture', {type:'preview'}, null, new Buffer(data, 'base64'));
		var iqNode = new protocol.Node('iq', attributes, [pictureNode, thumbNode]);
		
		this.addCallback(attributes.id, callback);
		
		this.sendNode(iqNode);
	}.bind(this);

	this.getMediaFile(filepath, MediaType.IMAGE, function(err, path) {
		if (err) {
			var errorObj = {
				code: 100,
				message: err
			};
			callback(errorObj);
			return;
		}
		
		fs.readFile(path, function(err, data) {
				if (err) {
					var errorObj = {
						code: 100,
						message: 'Error reading downloaded file: ' + JSON.stringify(err)
					};
					callback(errorObj);
					return;
				}
				
				pictureNode = new protocol.Node('picture', null, null, data); 
				this.createImageThumbnail(path, onThumbReady);
		}.bind(this));
		
	}.bind(this));
};

/**
 * requestProfilePicture - Send a request for the profile picture for the specified account
 * 
 * When received from server a profile.picture event is fired
 * When profile picture can not be retrieved an error 404 item-not-found is returned
 * @param {String} target - Phonenumber of the account to request profile picture from
 * @param {Boolean} small - true for thumbnail, false for full size profile picture
 * @example
 * //request full size profile picture from 49xxxxxxxx
 * wa.requestProfilePicture('49xxxxxxxx', false);
 * wa.on('profile.picture', function(from,isPreview,pictureData){
 *   fs.writeFile('whatsapi/media/profilepic-'+from+'.jpg', pictureData); 
 * });
 */
WhatsApi.requestProfilePicture = function(target, small) {
	var picAttributes = {
		type  : 'image'
	};

	if(small) {
		picAttributes['type'] = 'preview';
	}

	var pictureNode = new protocol.Node('picture', picAttributes);

	var attributes = {
		id   : this.nextMessageId('profilepicture'),
		type : 'get',
		to   : this.createJID(target),
		xmlns : 'w:profile:picture'
	};

	this.sendNode(new protocol.Node('iq', attributes, [pictureNode]));
};

/**
 * Extend account by one year from now
 */
WhatsApi.requestExtendAccount = function() {	
	var node = new protocol.Node(
		'iq',
		{
			id    : this.nextMessageId('extend_account_'),
			xmlns : 'urn:xmpp:whatsapp:account',
			type  : 'set',
			to    : this.config.server
		},
		[
			new protocol.Node('extend')
		]
	);
	
	this.sendNode(node);
};
