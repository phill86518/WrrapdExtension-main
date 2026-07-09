<?php
/**
 * BoldSign API client for Wrrapd WrapStars onboarding (MU-plugin).
 *
 * wp-config.php:
 *   define( 'WRRAPD_BOLDSIGN_API_KEY', '…' );
 *   define( 'WRRAPD_BOLDSIGN_IC_TEMPLATE_ID', '…' );
 *   define( 'WRRAPD_BOLDSIGN_W9_TEMPLATE_ID', '…' );
 *   define( 'WRRAPD_BOLDSIGN_API_BASE', 'https://api.boldsign.com' ); // optional
 *
 * @package WrrapdWrapStars
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * BoldSign REST client.
 */
class Wrrapd_BoldSign_Client {

	/** @var string */
	private $api_key;

	/** @var string */
	private $base_url;

	public function __construct() {
		$this->api_key  = defined( 'WRRAPD_BOLDSIGN_API_KEY' ) ? (string) WRRAPD_BOLDSIGN_API_KEY : '';
		$this->base_url = defined( 'WRRAPD_BOLDSIGN_API_BASE' ) && WRRAPD_BOLDSIGN_API_BASE !== ''
			? rtrim( (string) WRRAPD_BOLDSIGN_API_BASE, '/' )
			: 'https://api.boldsign.com';
	}

	/**
	 * @return bool
	 */
	public function is_configured() {
		return $this->api_key !== '';
	}

	/**
	 * @param string $template_id BoldSign template id.
	 * @param string $title Document title.
	 * @param string $signer_name Signer display name.
	 * @param string $signer_email Signer email (must match WP user).
	 * @param string $redirect_url After signing redirect.
	 * @return array{ok:bool,document_id?:string,error?:string}
	 */
	public function send_from_template( $template_id, $title, $signer_name, $signer_email, $redirect_url = '' ) {
		if ( ! $this->is_configured() ) {
			return array( 'ok' => false, 'error' => 'BoldSign API key is not configured.' );
		}
		if ( $template_id === '' ) {
			return array( 'ok' => false, 'error' => 'BoldSign template ID is not configured.' );
		}

		$body = array(
			'templateId'    => $template_id,
			'title'         => $title,
			'disableEmails' => true,
			'signers'       => array(
				array(
					'name'         => $signer_name,
					'emailAddress' => $signer_email,
					'signerType'   => 'Signer',
					'signerOrder'  => 1,
				),
			),
		);

		if ( $redirect_url !== '' ) {
			$body['redirectUrl'] = $redirect_url;
		}

		$res = $this->request( 'POST', '/v1/document/send', $body );
		if ( ! $res['ok'] ) {
			return $res;
		}

		$document_id = '';
		if ( isset( $res['data']['documentId'] ) ) {
			$document_id = (string) $res['data']['documentId'];
		} elseif ( isset( $res['data']['document_id'] ) ) {
			$document_id = (string) $res['data']['document_id'];
		}

		if ( $document_id === '' ) {
			return array( 'ok' => false, 'error' => 'BoldSign did not return a document ID.' );
		}

		return array( 'ok' => true, 'document_id' => $document_id );
	}

	/**
	 * @param string $document_id Document id.
	 * @param string $signer_email Signer email.
	 * @param string $redirect_url Optional redirect after sign.
	 * @return array{ok:bool,sign_url?:string,error?:string}
	 */
	public function get_embedded_sign_link( $document_id, $signer_email, $redirect_url = '' ) {
		if ( ! $this->is_configured() ) {
			return array( 'ok' => false, 'error' => 'BoldSign API key is not configured.' );
		}

		$query = array(
			'documentId'  => $document_id,
			'signerEmail' => $signer_email,
		);
		if ( $redirect_url !== '' ) {
			$query['redirectUrl'] = $redirect_url;
		}

		$res = $this->request( 'GET', '/v1/document/getEmbeddedSignLink?' . http_build_query( $query ) );
		if ( ! $res['ok'] ) {
			return $res;
		}

		$sign_url = '';
		if ( isset( $res['data']['signLink'] ) ) {
			$sign_url = (string) $res['data']['signLink'];
		} elseif ( isset( $res['data']['signUrl'] ) ) {
			$sign_url = (string) $res['data']['signUrl'];
		} elseif ( isset( $res['data']['url'] ) ) {
			$sign_url = (string) $res['data']['url'];
		}

		if ( $sign_url === '' ) {
			return array( 'ok' => false, 'error' => 'BoldSign did not return a signing URL.' );
		}

		return array( 'ok' => true, 'sign_url' => $sign_url );
	}

	/**
	 * @param string $document_id Document id.
	 * @return array{ok:bool,bytes?:string,error?:string}
	 */
	public function download_document( $document_id ) {
		if ( ! $this->is_configured() ) {
			return array( 'ok' => false, 'error' => 'BoldSign API key is not configured.' );
		}

		$url  = $this->base_url . '/v1/document/download?documentId=' . rawurlencode( $document_id );
		$resp = wp_remote_get(
			$url,
			array(
				'timeout' => 60,
				'headers' => array(
					'X-API-KEY' => $this->api_key,
					'Accept'    => 'application/pdf',
				),
			)
		);

		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'error' => $resp->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $resp );
		if ( $code < 200 || $code >= 300 ) {
			return array( 'ok' => false, 'error' => 'BoldSign download failed (HTTP ' . $code . ').' );
		}

		$bytes = wp_remote_retrieve_body( $resp );
		if ( ! is_string( $bytes ) || $bytes === '' ) {
			return array( 'ok' => false, 'error' => 'BoldSign download returned empty body.' );
		}

		return array( 'ok' => true, 'bytes' => $bytes );
	}

	/**
	 * @param string $method HTTP method.
	 * @param string $path Path with optional query string.
	 * @param array|null $body JSON body for POST.
	 * @return array{ok:bool,data?:array,error?:string}
	 */
	private function request( $method, $path, $body = null ) {
		$url = $this->base_url . $path;
		$args = array(
			'method'  => $method,
			'timeout' => 45,
			'headers' => array(
				'X-API-KEY'     => $this->api_key,
				'Content-Type'  => 'application/json',
				'Accept'        => 'application/json',
			),
		);
		if ( $body !== null ) {
			$args['body'] = wp_json_encode( $body );
		}

		$resp = wp_remote_request( $url, $args );
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'error' => $resp->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $resp );
		$raw  = wp_remote_retrieve_body( $resp );
		$data = json_decode( is_string( $raw ) ? $raw : '', true );
		if ( ! is_array( $data ) ) {
			$data = array();
		}

		if ( $code < 200 || $code >= 300 ) {
			$msg = isset( $data['message'] ) ? (string) $data['message'] : ( isset( $data['error'] ) ? (string) $data['error'] : 'BoldSign API error (HTTP ' . $code . ').' );
			return array( 'ok' => false, 'error' => $msg );
		}

		return array( 'ok' => true, 'data' => $data );
	}
}

/**
 * @return Wrrapd_BoldSign_Client
 */
function wrrapd_boldsign_client() {
	static $client = null;
	if ( $client === null ) {
		$client = new Wrrapd_BoldSign_Client();
	}
	return $client;
}

/**
 * Register BoldSign webhook REST route.
 */
function wrrapd_boldsign_register_rest_routes() {
	register_rest_route(
		'wrrapd/v1',
		'/boldsign-webhook',
		array(
			'methods'             => 'POST',
			'callback'            => 'wrrapd_boldsign_webhook_handler',
			'permission_callback' => '__return_true',
		)
	);
}
add_action( 'rest_api_init', 'wrrapd_boldsign_register_rest_routes' );

/**
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response
 */
function wrrapd_boldsign_webhook_handler( $request ) {
	$payload = $request->get_json_params();
	if ( ! is_array( $payload ) ) {
		$payload = array();
	}

	$event_type = '';
	if ( isset( $payload['eventType'] ) ) {
		$event_type = (string) $payload['eventType'];
	} elseif ( isset( $payload['event'] ) ) {
		$event_type = (string) $payload['event'];
	}

	$document_id = '';
	if ( isset( $payload['documentId'] ) ) {
		$document_id = (string) $payload['documentId'];
	} elseif ( isset( $payload['data']['documentId'] ) ) {
		$document_id = (string) $payload['data']['documentId'];
	}

	if ( $document_id === '' ) {
		return new WP_REST_Response( array( 'ok' => true, 'ignored' => true ), 200 );
	}

	$completed_events = array( 'Completed', 'DocumentCompleted', 'document.completed', 'Signed', 'DocumentSigned' );
	if ( ! in_array( $event_type, $completed_events, true ) && $event_type !== '' ) {
		return new WP_REST_Response( array( 'ok' => true, 'ignored' => true ), 200 );
	}

	if ( function_exists( 'wrrapd_wrapstars_handle_boldsign_completed' ) ) {
		wrrapd_wrapstars_handle_boldsign_completed( $document_id );
	}

	return new WP_REST_Response( array( 'ok' => true ), 200 );
}
