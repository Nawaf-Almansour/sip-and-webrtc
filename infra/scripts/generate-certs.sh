#!/bin/bash

# Generate self-signed certificates for development

CERT_DIR="$(dirname "$0")/../certs"

mkdir -p "$CERT_DIR"

# Generate CA
openssl genrsa -out "$CERT_DIR/ca.key" 4096
openssl req -new -x509 -days 365 -key "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" \
  -subj "/C=US/ST=Dev/L=Dev/O=SIP-Meetings/CN=SIP-Meetings-CA"

# Generate server certificate
openssl genrsa -out "$CERT_DIR/server.key" 2048
openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" \
  -subj "/C=US/ST=Dev/L=Dev/O=SIP-Meetings/CN=localhost"

# Create extension file for SAN
cat > "$CERT_DIR/server.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Sign server certificate
openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/server.crt" -days 365 -extfile "$CERT_DIR/server.ext"

# Cleanup
rm "$CERT_DIR/server.csr" "$CERT_DIR/server.ext" "$CERT_DIR/ca.srl" 2>/dev/null

# Create combined PEM for some services
cat "$CERT_DIR/server.crt" "$CERT_DIR/server.key" > "$CERT_DIR/server.pem"

echo "Certificates generated in $CERT_DIR"
echo "  - ca.crt (CA certificate)"
echo "  - server.crt (Server certificate)"
echo "  - server.key (Server private key)"
echo "  - server.pem (Combined cert+key)"
